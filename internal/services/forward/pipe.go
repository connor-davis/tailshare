package forward

import (
	"io"
	"net"
	"sync"
)

// tracker holds the live connections of one share so stopping it closes them all.
type tracker struct {
	mu     sync.Mutex
	conns  map[net.Conn]struct{}
	closed bool
}

// add records a connection. It refuses at the cap or after closeAll.
func (t *tracker) add(conn net.Conn, limit int) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.closed || len(t.conns) >= limit {
		return false
	}
	if t.conns == nil {
		t.conns = make(map[net.Conn]struct{})
	}
	t.conns[conn] = struct{}{}
	return true
}

func (t *tracker) remove(conn net.Conn) {
	t.mu.Lock()
	delete(t.conns, conn)
	t.mu.Unlock()
}

func (t *tracker) closeAll() {
	t.mu.Lock()
	t.closed = true
	conns := t.conns
	t.conns = nil
	t.mu.Unlock()
	for conn := range conns {
		_ = conn.Close()
	}
}

// pipe copies both ways until each side is done, then closes both. When one
// direction ends and its target can half-close, the other direction may still
// finish, so a client that stops sending still gets its answer.
func pipe(left, right net.Conn) {
	defer func() { _ = left.Close(); _ = right.Close() }()

	var wg sync.WaitGroup
	copyOne := func(dst, src net.Conn) {
		defer wg.Done()
		_, _ = io.Copy(dst, src)
		if half, ok := dst.(interface{ CloseWrite() error }); ok {
			_ = half.CloseWrite()
			return
		}
		// No half-close here: end both so the other copy cannot hang.
		_ = left.Close()
		_ = right.Close()
	}
	wg.Add(2)
	go copyOne(right, left)
	go copyOne(left, right)
	wg.Wait()
}
