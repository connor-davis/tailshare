package forward

import (
	"context"
	"math"
	"net"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
)

// opened is one share this computer listens for, on 127.0.0.1 only.
type opened struct {
	owner   string
	shareID string
	port    int
	ln      net.Listener
	clients tracker
	streams tracker
	once    sync.Once
}

// close stops the listener and every connection it carries.
func (open *opened) close() {
	open.once.Do(func() {
		_ = open.ln.Close()
		open.clients.closeAll()
		open.streams.closeAll()
	})
}

// Open starts listening on a free loopback port for another member's share.
// Opening a share that is already open returns it unchanged.
func (forwards *Forwards) Open(id string) (Item, error) {
	item, ok := findItem(forwards.State().Others, id)
	if !ok {
		return Item{}, ErrNotFound
	}
	if item.Open {
		return item, nil
	}

	// Loopback only: no other computer on the network can reach this port.
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return Item{}, ErrUnreachable
	}
	open := &opened{
		owner: item.OwnerID, shareID: id, port: ln.Addr().(*net.TCPAddr).Port, ln: ln,
	}

	forwards.mu.Lock()
	if _, taken := forwards.opens[id]; taken || forwards.ctx.Err() != nil {
		forwards.mu.Unlock()
		_ = ln.Close()
		return forwards.openItem(id)
	}
	forwards.opens[id] = open
	forwards.mu.Unlock()

	go forwards.accept(open)
	forwards.notify()

	item.Open, item.LocalPort = true, open.port
	return item, nil
}

// openItem re-reads a share after losing a race to open it.
func (forwards *Forwards) openItem(id string) (Item, error) {
	item, ok := findItem(forwards.State().Others, id)
	if !ok {
		return Item{}, ErrNotFound
	}
	return item, nil
}

func findItem(items []Item, id string) (Item, bool) {
	for _, item := range items {
		if item.ID == id {
			return item, true
		}
	}
	return Item{}, false
}

// CloseOpen stops listening for a share and closes its connections.
func (forwards *Forwards) CloseOpen(id string) error {
	forwards.mu.Lock()
	open, ok := forwards.opens[id]
	delete(forwards.opens, id)
	forwards.mu.Unlock()
	if !ok {
		return ErrNotFound
	}

	open.close()
	forwards.notify()
	return nil
}

func (forwards *Forwards) accept(open *opened) {
	for {
		conn, err := open.ln.Accept()
		if err != nil {
			return
		}
		if !open.clients.add(conn, peer.MaxForwardConns) {
			_ = conn.Close()
			continue
		}
		go forwards.bridge(open, conn)
	}
}

// bridge asks the sharer for a stream and pipes it to one local connection.
func (forwards *Forwards) bridge(open *opened, conn net.Conn) {
	defer open.clients.remove(conn)

	forwards.mu.Lock()
	room := forwards.room
	forwards.mu.Unlock()
	if room == nil {
		_ = conn.Close()
		return
	}

	ctx, cancel := context.WithTimeout(forwards.ctx, 15*time.Second)
	stream, err := room.OpenStream(ctx, open.owner, KindForward, []byte(open.shareID))
	cancel()
	if err != nil || !open.streams.add(stream, math.MaxInt) {
		_ = conn.Close()
		if err == nil {
			_ = stream.Close()
		}
		return
	}
	defer open.streams.remove(stream)

	pipe(conn, stream)
}
