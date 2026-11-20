package session

import (
	"context"
	"errors"
	"net"

	"github.com/Polyphron-AI/tailshare/internal/platform/config"
	"github.com/Polyphron-AI/tailshare/internal/services/codes"
	"github.com/Polyphron-AI/tailshare/internal/services/mesh"
	"github.com/Polyphron-AI/tailshare/internal/services/peer"
	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

// Join waits for local approval and connects every member. Close owns the returned lifetime.
func Join(ctx context.Context, input string, cfg config.Config, name string, options Options) (*Session, error) {
	return join(ctx, input, settings{
		regionID: cfg.Region, mapURL: cfg.DERPMapURL, name: name, options: options,
		allowWindow: allowWindow, lostGrace: lostGrace,
	})
}

func join(ctx context.Context, input string, options settings) (*Session, error) {
	code, err := codes.Parse(input)
	if err != nil {
		return nil, err
	}

	var resolveOptions []any
	if options.derpMap != nil {
		resolveOptions = append(resolveOptions, options.derpMap)
	} else if options.mapURL != "" {
		resolveOptions = append(resolveOptions, tailcat.DERPMapURL(options.mapURL))
	}

	address, err := codes.Addr(code, options.regionID).Resolve(ctx, resolveOptions...)
	if err != nil {
		return nil, errors.New("Could not find the relay for the other computer.")
	}

	session, err := newSession(context.Background(), options, code)
	if err != nil {
		return nil, err
	}
	success := false
	defer func() {
		if !success {
			_ = session.Close()
		}
	}()

	identity := key.NewNode()
	client := tailcat.NewClient(address)
	client.Key = identity
	client.Logf = quietLog
	defer client.Close()

	conn, err := dialBootstrap(ctx, client)
	if err != nil {
		return nil, errors.New("Could not reach the other computer.")
	}
	defer conn.Close()

	if err := writeJoinLine(ctx, conn, identity.Public(), session.mesh.Self().Address); err != nil {
		return nil, errors.New("Could not finish connecting to the other computer.")
	}

	control, err := peer.Start(ctx, conn, peer.Options{DisplayName: options.name})
	if err != nil {
		return nil, err
	}
	defer control.Close()

	var roster peer.ShareRoster
	if err := control.Call(ctx, peer.MethodShareRoster, nil, &roster); err != nil {
		return nil, err
	}
	if err := session.mesh.SetRoster(roster); err != nil {
		return nil, err
	}

	links := make(map[string]*mesh.Link)
	defer func() {
		if !success {
			for _, link := range links {
				_ = link.Close()
			}
		}
	}()
	payload := peer.ShareLinks{}
	for _, member := range roster.Members {
		if member.ID == session.mesh.Self().ID {
			continue
		}
		link, err := mesh.NewLink(member.Address)
		if err != nil {
			return nil, err
		}
		links[member.ID] = link
		payload.Links = append(
			payload.Links,
			peer.ShareLink{ID: member.ID, LinkKey: link.PublicKey()},
		)
	}

	if err := control.Call(ctx, peer.MethodShareLinks, payload, nil); err != nil {
		return nil, err
	}
	_ = control.Close()

	if err := session.dialAll(ctx, links); err != nil {
		return nil, errors.New("Could not connect everyone in the share.")
	}
	success = true
	return session, nil
}

func dialBootstrap(ctx context.Context, client *tailcat.Client) (net.Conn, error) {
	// A relay may still be connecting when the first ping times out.
	if _, err := client.Ping(ctx); err != nil {
		if _, err = client.Ping(ctx); err != nil {
			return nil, err
		}
	}

	return client.DialTCPPort(ctx, sessionPort)
}
