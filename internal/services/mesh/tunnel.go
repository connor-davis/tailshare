package mesh

import (
	"context"
	"net"
)

// Tunnel carries data streams for one authenticated member. Only the link dialer opens streams.
type Tunnel struct {
	mesh     *Mesh
	id       string
	incoming chan net.Conn
	done     chan struct{}
}

// Tunnel returns the data stream queue for a current member.
func (mesh *Mesh) Tunnel(id string) (*Tunnel, bool) {
	mesh.mu.Lock()
	defer mesh.mu.Unlock()
	if _, ok := mesh.members[id]; !ok || mesh.closed || id == mesh.self.ID {
		return nil, false
	}
	return mesh.tunnelLocked(id), true
}

func (mesh *Mesh) tunnelLocked(id string) *Tunnel {
	tunnel := mesh.tunnels[id]
	if tunnel == nil {
		tunnel = &Tunnel{mesh: mesh, id: id, incoming: make(chan net.Conn, 8), done: make(chan struct{})}
		mesh.tunnels[id] = tunnel
	}
	return tunnel
}

// Open opens a data stream on the outgoing link, when this member dialed it.
func (tunnel *Tunnel) Open(ctx context.Context) (net.Conn, error) {
	tunnel.mesh.mu.Lock()
	link := tunnel.mesh.outgoing[tunnel.id]
	closed := tunnel.mesh.closed
	tunnel.mesh.mu.Unlock()
	if closed || link == nil {
		return nil, net.ErrClosed
	}
	return link.Open(ctx)
}

// Accept waits for an incoming data stream, or the member's departure.
func (tunnel *Tunnel) Accept() (net.Conn, error) {
	select {
	case <-tunnel.done:
		return nil, net.ErrClosed
	default:
	}
	select {
	case conn := <-tunnel.incoming:
		select {
		case <-tunnel.done:
			_ = conn.Close()
			return nil, net.ErrClosed
		default:
		}
		return conn, nil
	case <-tunnel.done:
		return nil, net.ErrClosed
	}
}
