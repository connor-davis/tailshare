package session

import (
	"context"
	"errors"
	"net"

	"github.com/Polyphron-AI/tailshare/internal/platform/config"
	"github.com/Polyphron-AI/tailshare/internal/services/codes"
	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

// Join connects by code and moves to fresh keys before returning. The context
// bounds connecting; Close controls the lifetime of the returned session.
func Join(ctx context.Context, input string, cfg config.Config) (*Session, error) {
	return join(ctx, input, settings{regionID: cfg.Region, mapURL: cfg.DERPMapURL})
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

	return rekeyJoin(ctx, conn, identity)
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
