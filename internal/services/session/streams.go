package session

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/services/mesh"
	"github.com/connor-davis/tailshare/internal/services/peer"
)

// kindReverse is the internal stream kind that answers a stream.open request.
const kindReverse byte = 0

// streamHeaderWait bounds how long a new stream may take to send its header.
const streamHeaderWait = 10 * time.Second

// StreamHandler serves one accepted stream of a registered kind. It owns conn.
// memberID is the authenticated member on the other end, never a claimed name.
type StreamHandler func(memberID string, header []byte, conn net.Conn)

// streams is the session's stream state: kind handlers and waiting requests.
type streams struct {
	mu       sync.Mutex
	handlers map[byte]StreamHandler
	waiting  map[string]*waiter
}

type waiter struct {
	member string
	conn   chan net.Conn
}

// HandleStream registers the handler for a stream kind from 1 to 255, once.
func (session *Session) HandleStream(kind byte, handler StreamHandler) error {
	session.streams.mu.Lock()
	defer session.streams.mu.Unlock()
	if kind == kindReverse || handler == nil || session.streams.handlers[kind] != nil {
		return errors.New("That stream kind cannot be registered.")
	}
	session.streams.handlers[kind] = handler
	return nil
}

// OpenStream opens a stream of a kind to a member and returns this side of it.
// The member's handler for kind runs on the other end with the same header.
// When the other member dialed the link, it is asked over control to open the
// stream back, because only the dialer can open one.
func (session *Session) OpenStream(
	ctx context.Context,
	memberID string,
	kind byte,
	header []byte,
) (net.Conn, error) {
	if kind == kindReverse || len(header) > peer.MaxStreamHeader {
		return nil, errors.New("That stream cannot be opened.")
	}
	tunnel, ok := session.Tunnel(memberID)
	if !ok {
		return nil, net.ErrClosed
	}

	conn, err := tunnel.OpenStream(ctx)
	if err == nil {
		if err := writeStreamHeader(conn, kind, header); err != nil {
			_ = conn.Close()
			return nil, err
		}
		return conn, nil
	}
	if !errors.Is(err, mesh.ErrNotDialer) {
		return nil, err
	}

	control, ok := session.Control(memberID)
	if !ok {
		return nil, net.ErrClosed
	}
	nonce := make([]byte, 16)
	_, _ = rand.Read(nonce)
	key := string(nonce)
	wait := &waiter{member: memberID, conn: make(chan net.Conn, 1)}

	session.streams.mu.Lock()
	session.streams.waiting[key] = wait
	session.streams.mu.Unlock()
	defer func() {
		session.streams.mu.Lock()
		delete(session.streams.waiting, key)
		session.streams.mu.Unlock()
	}()

	request := peer.StreamOpen{Kind: int(kind), Header: header, Nonce: nonce}
	if err := control.Call(ctx, peer.MethodStreamOpen, request, nil); err != nil {
		return nil, err
	}

	bounded, cancel := context.WithTimeout(ctx, mesh.LinkTimeout)
	defer cancel()
	select {
	case conn := <-wait.conn:
		return conn, nil
	case <-bounded.Done():
		return nil, bounded.Err()
	case <-session.done:
		return nil, net.ErrClosed
	}
}

// Broadcast calls a method on every other member at once and returns each
// member's error. A nil entry means that member answered.
func (session *Session) Broadcast(ctx context.Context, method string, params any) map[string]error {
	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		results = make(map[string]error)
	)
	for _, member := range session.Members() {
		control, ok := session.Control(member.ID)
		if !ok {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := control.Call(ctx, method, params, nil)
			mu.Lock()
			results[member.ID] = err
			mu.Unlock()
		}()
	}
	wg.Wait()
	return results
}

func writeStreamHeader(conn net.Conn, kind byte, header []byte) error {
	_ = conn.SetWriteDeadline(time.Now().Add(streamHeaderWait))
	defer func() { _ = conn.SetWriteDeadline(time.Time{}) }()
	_, err := conn.Write(append([]byte{kind, byte(len(header))}, header...))
	return err
}

// serveStreams routes every session stream a member opens to us, until they leave.
func (session *Session) serveStreams(id string, tunnel *mesh.Tunnel) {
	for {
		conn, err := tunnel.AcceptStream()
		if err != nil {
			return
		}
		go session.routeStream(id, conn)
	}
}

func (session *Session) routeStream(id string, conn net.Conn) {
	_ = conn.SetReadDeadline(time.Now().Add(streamHeaderWait))
	var lead [2]byte
	if _, err := io.ReadFull(conn, lead[:]); err != nil || int(lead[1]) > peer.MaxStreamHeader {
		_ = conn.Close()
		return
	}
	header := make([]byte, lead[1])
	if _, err := io.ReadFull(conn, header); err != nil {
		_ = conn.Close()
		return
	}
	_ = conn.SetReadDeadline(time.Time{})

	session.streams.mu.Lock()
	handler := session.streams.handlers[lead[0]]
	wait := session.streams.waiting[string(header)]
	session.streams.mu.Unlock()

	if lead[0] == kindReverse {
		// Only the member we asked may answer, so a nonce never leaks to another.
		if wait == nil || wait.member != id {
			_ = conn.Close()
			return
		}
		select {
		case wait.conn <- conn:
		default:
			_ = conn.Close()
		}
		return
	}
	if handler == nil {
		_ = conn.Close()
		return
	}
	handler(id, header, conn)
}

// streamHandlers is the control request a member sends when it needs us to open a stream.
func (session *Session) streamHandlers(id string) map[string]peer.Handler {
	return map[string]peer.Handler{
		peer.MethodStreamOpen: func(ctx context.Context, raw json.RawMessage) (any, error) {
			var request peer.StreamOpen
			if len(raw) > peer.MaxSharePayload || json.Unmarshal(raw, &request) != nil ||
				request.Kind < 1 || request.Kind > 255 || len(request.Header) > peer.MaxStreamHeader ||
				len(request.Nonce) != 16 {
				return nil, &peer.RemoteError{Code: peer.CodeBadRequest, Message: "Bad stream request."}
			}
			kind := byte(request.Kind)

			session.streams.mu.Lock()
			handler := session.streams.handlers[kind]
			session.streams.mu.Unlock()
			if handler == nil {
				return nil, &peer.RemoteError{Code: peer.CodeUnknownMethod, Message: "Not supported."}
			}

			tunnel, ok := session.Tunnel(id)
			if !ok {
				return nil, &peer.RemoteError{Code: peer.CodeNotFound, Message: "Not a member."}
			}
			back, err := tunnel.OpenStream(ctx)
			if err != nil {
				return nil, &peer.RemoteError{Code: peer.CodeBusy, Message: "Could not open a stream."}
			}
			if err := writeStreamHeader(back, kindReverse, request.Nonce); err != nil {
				_ = back.Close()
				return nil, &peer.RemoteError{Code: peer.CodeBusy, Message: "Could not open a stream."}
			}

			go handler(id, request.Header, back)
			return struct{}{}, nil
		},
	}
}
