package mesh

import (
	"context"
	"io"
	"net"
	"net/netip"
	"sync"
	"time"

	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

// Link owns exactly one client and its fresh identity. It can open many streams.
type Link struct {
	client *tailcat.Client
	once   sync.Once
}

// NewLink creates an undialed link. Submit PublicKey in share.links before Open.
func NewLink(address string) (*Link, error) {
	if len(address) > 4096 {
		return nil, invalid()
	}

	_, err := tailcat.ParseAddr(tailcat.Addr(address))
	if err != nil {
		return nil, invalid()
	}
	client := tailcat.NewClient(tailcat.Addr(address))
	client.Key = key.NewNode()
	client.Logf = quietLog
	return &Link{client: client}, nil
}

// PublicKey is the key that the target must expect before this link dials.
func (link *Link) PublicKey() string {
	return link.client.Key.Public().String()
}

// Open opens a stream with a deadline even when Tailcat silently ignores the key.
func (link *Link) Open(ctx context.Context) (net.Conn, error) {
	return link.open(ctx, 'D')
}

func (link *Link) open(ctx context.Context, kind byte) (net.Conn, error) {
	bounded, cancel := context.WithTimeout(ctx, LinkTimeout)
	defer cancel()

	conn, err := link.client.DialTCPPort(bounded, 80)
	if err != nil {
		return nil, err
	}
	deadline := time.Now().Add(5 * time.Second)
	if limit, ok := bounded.Deadline(); ok && limit.Before(deadline) {
		deadline = limit
	}
	_ = conn.SetWriteDeadline(deadline)
	if _, err := conn.Write([]byte{kind}); err != nil {
		_ = conn.Close()
		return nil, err
	}
	_ = conn.SetWriteDeadline(time.Time{})
	return conn, nil
}

// Close stops only this link's client and streams.
func (link *Link) Close() error {
	var err error
	link.once.Do(func() { err = link.client.Close() })
	return err
}

// Dial opens the first stream and takes ownership of a prepared link on success.
// Its address must match the member in the validated roster.
func (mesh *Mesh) Dial(ctx context.Context, id string, link *Link) (net.Conn, error) {
	mesh.mu.Lock()
	member, ok := mesh.members[id]
	if !ok || mesh.closed || id == mesh.self.ID || link == nil || mesh.outgoing[id] != nil ||
		string(link.client.Server) != member.Address {
		mesh.mu.Unlock()
		return nil, invalid()
	}
	mesh.outgoing[id] = link
	mesh.mu.Unlock()

	conn, err := link.open(ctx, 'C')
	if err != nil {
		mesh.mu.Lock()
		if mesh.outgoing[id] == link {
			delete(mesh.outgoing, id)
		}
		mesh.mu.Unlock()
		_ = link.Close()
		return nil, failure()
	}

	mesh.mu.Lock()
	_, present := mesh.members[id]
	valid := !mesh.closed && present && mesh.outgoing[id] == link
	mesh.mu.Unlock()
	if !valid {
		_ = conn.Close()
		return nil, failure()
	}
	return conn, nil
}

// Accept returns only streams whose authenticated source is still expected.
// No claimed member ID or peer payload participates in this check.
func (mesh *Mesh) Accept() (string, net.Conn, error) {
	mesh.acceptOnce.Do(func() { go mesh.acceptLoop() })
	select {
	case result := <-mesh.accepted:
		return result.id, result.conn, nil
	case <-mesh.acceptDone:
		return "", nil, net.ErrClosed
	}
}

type controlStream struct {
	id   string
	conn net.Conn
}

func (mesh *Mesh) acceptLoop() {
	defer close(mesh.acceptDone)
	for {
		conn, err := mesh.listener.Accept()
		if err != nil {
			return
		}
		mesh.mu.Lock()
		id := mesh.identityLocked(conn.RemoteAddr())
		if id == "" || len(mesh.incoming[id]) >= 12 {
			mesh.mu.Unlock()
			_ = conn.Close()
			continue
		}
		if mesh.incoming[id] == nil {
			mesh.incoming[id] = make(map[net.Conn]struct{})
		}
		mesh.incoming[id][conn] = struct{}{}
		mesh.mu.Unlock()
		go mesh.routeStream(id, conn)
	}
}

func (mesh *Mesh) routeStream(id string, conn net.Conn) {
	stream := &acceptedStream{Conn: conn, mesh: mesh, id: id}
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	var prefix [1]byte
	_, err := io.ReadFull(conn, prefix[:])
	_ = conn.SetReadDeadline(time.Time{})
	if err != nil || (prefix[0] != 'C' && prefix[0] != 'D') {
		_ = stream.Close()
		return
	}

	mesh.mu.Lock()
	if mesh.identityLocked(conn.RemoteAddr()) != id {
		mesh.mu.Unlock()
		_ = stream.Close()
		return
	}
	if prefix[0] == 'C' {
		if mesh.controls[id] != nil || mesh.pendingControls[id] != nil {
			mesh.mu.Unlock()
			_ = stream.Close()
			return
		}
		mesh.pendingControls[id] = conn
		mesh.mu.Unlock()
		select {
		case mesh.accepted <- controlStream{id, stream}:
		case <-mesh.acceptDone:
			_ = stream.Close()
		}
		return
	}
	tunnel := mesh.tunnelLocked(id)
	select {
	case tunnel.incoming <- stream:
		mesh.mu.Unlock()
	default:
		mesh.mu.Unlock()
		_ = stream.Close()
	}
}

func (mesh *Mesh) identityLocked(address net.Addr) string {
	remote, err := netip.ParseAddrPort(address.String())
	if err != nil || mesh.closed {
		return ""
	}
	for public, id := range mesh.expected {
		if _, present := mesh.members[id]; present && tailcatIP(public) == remote.Addr().Unmap() {
			if _, authenticated := mesh.server.Status().Peer[public]; authenticated {
				return id
			}
		}
	}
	return ""
}

// tailcatIP follows Tailcat v0.7.0's fixed node-key address rule. Status leaves
// TailscaleIPs empty, so match the authenticated status key against its address.
func tailcatIP(public key.NodePublic) netip.Addr {
	address := [16]byte{0xfd, 0x7a, 0x11, 0x5c, 0xa1, 0xe0}
	copy(address[6:], public.AppendTo(nil)[:10])
	return netip.AddrFrom16(address)
}

// acceptedStream forgets closed streams so long shares do not retain every transfer.
type acceptedStream struct {
	net.Conn
	mesh *Mesh
	id   string
}

func (stream *acceptedStream) Close() error {
	err := stream.Conn.Close()
	stream.mesh.mu.Lock()
	delete(stream.mesh.incoming[stream.id], stream.Conn)
	if stream.mesh.pendingControls[stream.id] == stream.Conn {
		delete(stream.mesh.pendingControls, stream.id)
	}
	stream.mesh.mu.Unlock()
	return err
}
