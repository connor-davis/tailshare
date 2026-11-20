package transfer

import (
	"context"
	"io"
	"net"
	"time"
)

func (manager *Manager) register(item *job) error {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if !validID(item.view.ID) {
		return errInvalid
	}
	if _, exists := manager.waiters[item.view.ID]; exists {
		return errInvalid
	}
	item.waiter = make(chan net.Conn, 1)
	manager.waiters[item.view.ID] = item.waiter
	return nil
}

func (manager *Manager) acceptLoop() {
	for {
		conn, err := manager.tunnel.Accept()
		if err != nil {
			return
		}
		// The header deadline bounds an unrecognized stream without delaying other transfers.
		go manager.route(conn)
	}
}

func (manager *Manager) route(conn net.Conn) {
	_ = conn.SetReadDeadline(time.Now().Add(headerTimeout))
	header := make([]byte, 26)
	if _, err := io.ReadFull(conn, header); err != nil {
		_ = conn.Close()
		return
	}
	_ = conn.SetReadDeadline(time.Time{})
	id := string(header)
	manager.mu.Lock()
	defer manager.mu.Unlock()
	waiter := manager.waiters[id]
	item := manager.jobs[id]
	if !validID(id) || waiter == nil || item == nil || !active(item.view.State) {
		_ = conn.Close()
		return
	}
	delete(manager.waiters, id)
	waiter <- conn
}

func (manager *Manager) stream(item *job) (net.Conn, error) {
	ctx, cancel := context.WithTimeout(item.ctx, streamTimeout)
	defer cancel()
	if !manager.host {
		conn, err := manager.tunnel.Open(ctx)
		if err != nil {
			return nil, errDropped
		}
		_ = conn.SetWriteDeadline(time.Now().Add(headerTimeout))
		if _, err := io.WriteString(conn, item.view.ID); err != nil {
			_ = conn.Close()
			return nil, errDropped
		}
		_ = conn.SetWriteDeadline(time.Time{})
		return conn, nil
	}

	select {
	case conn := <-item.waiter:
		return conn, nil
	case <-ctx.Done():
		return nil, errDropped
	}
}
