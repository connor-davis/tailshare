// Package session connects two computers by a short, single-use share code.
package session

import (
	"context"
	"errors"
	"net"
	"sync"
	"time"

	"github.com/tailscale/tailcat"
	"tailscale.com/tailcfg"
)

const sessionPort = 80

// Session owns a rekeyed tunnel. Hosts accept streams; joiners open streams.
// Close releases the tunnel and any connection not yet handed to the caller.
type Session struct {
	mu            sync.Mutex
	server        *tailcat.Server
	client        *tailcat.Client
	listener      net.Listener
	first         net.Conn
	bootstrap     net.Conn
	bootstrapDone chan struct{}
	timer         *time.Timer
	closed        bool
	incoming      chan net.Conn
	done          chan struct{}
	cancel        context.CancelFunc
}

type settings struct {
	regionID tailcfg.DERPRegionID
	mapURL   string
	region   *tailcfg.DERPRegion
	derpMap  *tailcfg.DERPMap
	expiry   time.Duration
}

func newSession(ctx context.Context) (*Session, context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	session := &Session{incoming: make(chan net.Conn), done: make(chan struct{}), cancel: cancel}

	return session, ctx
}

// Open opens a stream to the host. It is available only on a joined session.
func (session *Session) Open(ctx context.Context) (net.Conn, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	session.mu.Lock()
	if session.closed {
		session.mu.Unlock()
		return nil, net.ErrClosed
	}

	if session.first != nil {
		conn := session.first
		session.first = nil
		session.mu.Unlock()
		return conn, nil
	}

	client := session.client
	session.mu.Unlock()
	if client == nil {
		return nil, errors.New("Only the joining computer can open a connection.")
	}

	conn, err := client.DialTCPPort(ctx, sessionPort)
	if err != nil {
		return nil, errors.New("Could not reach the other computer.")
	}

	return conn, nil
}

// Accept waits for a stream on a hosted session, including while it is rekeying.
func (session *Session) Accept() (net.Conn, error) {
	session.mu.Lock()
	joined := session.client != nil
	session.mu.Unlock()
	if joined {
		return nil, errors.New("Only the hosting computer can accept a connection.")
	}

	select {
	case conn := <-session.incoming:
		return conn, nil
	case <-session.done:
		return nil, net.ErrClosed
	}
}

// Close stops the session. Calling it more than once is safe.
func (session *Session) Close() error {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return nil
	}

	session.closed = true
	close(session.done)
	session.cancel()
	if session.timer != nil {
		session.timer.Stop()
	}

	var result error
	for _, conn := range []net.Conn{session.first, session.bootstrap} {
		if conn != nil {
			result = errors.Join(result, conn.Close())
		}
	}

	if session.listener != nil {
		result = errors.Join(result, session.listener.Close())
	}
	if session.server != nil {
		result = errors.Join(result, session.server.Close())
	}
	if session.client != nil {
		result = errors.Join(result, session.client.Close())
	}

	return result
}
