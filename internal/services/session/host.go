package session

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/platform/config"
	"github.com/Polyphron-AI/tailshare/internal/services/codes"
	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

// Host returns a new code and listens for its first joiner. An unused code expires
// after ten minutes. The context controls the lifetime of the returned session.
func Host(ctx context.Context, cfg config.Config) (*Session, codes.Code, error) {
	return host(ctx, settings{regionID: cfg.Region, mapURL: cfg.DERPMapURL, expiry: 10 * time.Minute})
}

func host(ctx context.Context, options settings) (*Session, codes.Code, error) {
	code := codes.New()
	keys := codes.Derive(code)
	server := &tailcat.Server{
		Key: keys.Node, PresharedKey: keys.PSK,
		Region: options.region, RegionID: options.regionID, DERPMapURL: options.mapURL,
		Logf: quietLog,
	}

	listener, err := server.Listen(ctx, "tcp", fmt.Sprintf(":%d", sessionPort))
	if err != nil {
		_ = server.Close()
		return nil, "", errors.New("Could not start sharing on this computer.")
	}

	session, lifetime := newSession(ctx)
	session.mu.Lock()
	session.server = server
	session.listener = listener
	session.bootstrapDone = make(chan struct{})
	session.timer = time.AfterFunc(options.expiry, func() { _ = session.Close() })
	session.mu.Unlock()

	go func() {
		<-lifetime.Done()
		_ = session.Close()
	}()

	go session.admit(lifetime, server, listener)
	return session, code, nil
}

func (session *Session) admit(ctx context.Context, server *tailcat.Server, listener net.Listener) {
	defer close(session.bootstrapDone)

	for {
		conn, err := listener.Accept()
		if err != nil {
			return
		}

		peer, ok := readJoiner(ctx, server, conn)
		if !ok {
			_ = conn.Close()
			continue
		}

		session.mu.Lock()
		if session.closed {
			session.mu.Unlock()
			_ = conn.Close()
			return
		}

		// A single accept loop chooses the winner before any other stream is admitted.
		server.AddAllowedClient(peer)
		session.timer.Stop()
		session.bootstrap = conn
		session.mu.Unlock()

		if err := session.rekeyHost(ctx, server, conn, peer); err != nil {
			_ = session.Close()
		}
		return
	}
}

// peerKey finds which authenticated peer opened a stream. Tailcat leaves
// TailscaleIPs empty in its status, but it gives every peer a fixed address
// made from its node key, so we rebuild that address for each peer and match.
func peerKey(server *tailcat.Server, address net.Addr) (key.NodePublic, bool) {
	remote, err := netip.ParseAddrPort(address.String())
	if err != nil {
		return key.NodePublic{}, false
	}

	for peer := range server.Status().Peer {
		if tailcatIP(peer) == remote.Addr().Unmap() {
			return peer, true
		}
	}

	return key.NodePublic{}, false
}

// tailcatIP copies Tailcat's unexported tcAddrForKey (tailcat.go, v0.7.0):
// Tailscale's ULA prefix fd7a:115c:a1e0::/48 followed by the first 10 bytes
// of the node key. If Tailcat changes it, admission fails closed and the
// session tests break.
func tailcatIP(peer key.NodePublic) netip.Addr {
	address := [16]byte{0xfd, 0x7a, 0x11, 0x5c, 0xa1, 0xe0}
	copy(address[6:], peer.AppendTo(nil)[:10])

	return netip.AddrFrom16(address)
}

func quietLog(string, ...any) {}
