package session

import (
	"context"
	"errors"
	"net"
	"net/netip"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

// Host starts a share with a ten-minute unused code expiry. The context owns its lifetime.
func Host(ctx context.Context, cfg config.Config, name string, options Options) (*Session, codes.Code, error) {
	return host(ctx, settings{
		regionID: cfg.Region, mapURL: cfg.DERPMapURL, expiry: 10 * time.Minute,
		name: name, options: options, allowWindow: allowWindow, lostGrace: lostGrace,
	})
}

func host(ctx context.Context, options settings) (*Session, codes.Code, error) {
	code := codes.New()
	session, err := newSession(ctx, options, code)
	if err != nil {
		return nil, "", err
	}
	if err := session.startCodeServer(); err != nil {
		_ = session.Close()
		return nil, "", err
	}

	session.mu.Lock()
	if !session.closed && options.expiry > 0 {
		session.timer = time.AfterFunc(options.expiry, func() { _ = session.Close() })
	}
	session.mu.Unlock()
	return session, code, nil
}

func (session *Session) startCodeServer() error {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return net.ErrClosed
	}
	if session.server != nil || !session.mesh.IsAdmitter() {
		return nil
	}

	keys := codes.Derive(session.code)
	options := session.settings
	server := &tailcat.Server{
		Key: keys.Node, PresharedKey: keys.PSK,
		Region: options.region, RegionID: options.regionID, DERPMapURL: options.mapURL,
		Logf: quietLog,
	}
	// The code server stays open to strangers; only local Allow grants mesh access.
	listener, err := server.Listen(session.ctx, "tcp", ":80")
	if err != nil {
		_ = server.Close()
		return errors.New("Could not start sharing on this computer.")
	}
	session.server, session.listener = server, listener
	go session.acceptJoins(server, listener)
	session.changedLocked()
	return nil
}

func (session *Session) acceptJoins(server *tailcat.Server, listener net.Listener) {
	for {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		session.mu.Lock()
		if session.closed {
			session.mu.Unlock()
			_ = conn.Close()
			return
		}
		session.bootstraps[conn] = struct{}{}
		session.mu.Unlock()
		go session.admitStream(server, conn)
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
