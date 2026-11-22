// Package mesh owns group membership and the independently keyed Tailcat links.
// The code server and its local Allow/Deny prompt remain in session.
package mesh

import (
	"context"
	"net"
	"sort"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/tailscale/tailcat"
	"tailscale.com/tailcfg"
	"tailscale.com/types/key"
)

// Options chooses the local identity and relay. Region permits an offline relay.
type Options struct {
	DisplayName string
	RegionID    tailcfg.DERPRegionID
	Region      *tailcfg.DERPRegion
	DERPMapURL  string
}

// Mesh owns a mesh server, its roster and the authenticated expected-link list.
// Callers own the control peers registered with RegisterPeer.
type Mesh struct {
	mu              sync.Mutex
	server          *tailcat.Server
	listener        net.Listener
	self            peer.ShareMember
	members         map[string]peer.ShareMember
	expected        map[key.NodePublic]string
	used            map[key.NodePublic]bool
	controls        map[string]*peer.Peer
	incoming        map[string]map[net.Conn]struct{}
	outgoing        map[string]*Link
	tunnels         map[string]*Tunnel
	expiry          map[string]*time.Timer
	pending         *Admission
	closed          bool
	lastOrder       uint64
	nextOrder       uint64
	stop            func() bool
	acceptOnce      sync.Once
	accepted        chan controlStream
	acceptDone      chan struct{}
	pendingControls map[string]net.Conn
}

// New starts a fresh mesh server that allows no external client initially.
// The context controls the server lifetime, not individual dial deadlines.
func New(ctx context.Context, options Options) (*Mesh, error) {
	if !validName(options.DisplayName) {
		return nil, invalid()
	}

	private := key.NewNode()
	server := &tailcat.Server{
		Key: private, PresharedKey: tailcat.NewPresharedKey(),
		RegionID: options.RegionID, Region: options.Region, DERPMapURL: options.DERPMapURL,
		// An empty slice means allow-all in Tailcat. Seed the list with our own
		// server key, which can never be used as a client key in this mesh.
		AllowedClients: []key.NodePublic{private.Public()}, Logf: quietLog,
	}
	listener, err := server.Listen(ctx, "tcp", ":80")
	if err != nil {
		_ = server.Close()
		return nil, failure("the share could not listen")
	}

	self := peer.ShareMember{
		ID: server.Key.Public().String(), DisplayName: options.DisplayName,
		Address: string(server.TailcatAddr()), JoinOrder: 1,
	}
	mesh := &Mesh{
		server: server, listener: listener, self: self, lastOrder: 1,
		members:  map[string]peer.ShareMember{self.ID: self},
		expected: make(map[key.NodePublic]string), used: make(map[key.NodePublic]bool),
		expiry: make(map[string]*time.Timer), incoming: make(map[string]map[net.Conn]struct{}),
		controls: make(map[string]*peer.Peer), outgoing: make(map[string]*Link),
		tunnels:  make(map[string]*Tunnel),
		accepted: make(chan controlStream, 8), acceptDone: make(chan struct{}),
		pendingControls: make(map[string]net.Conn),
	}
	mesh.mu.Lock()
	mesh.stop = context.AfterFunc(ctx, func() { _ = mesh.Close() })
	mesh.mu.Unlock()
	return mesh, nil
}

// Self returns this member's current identity and join order.
func (mesh *Mesh) Self() peer.ShareMember {
	mesh.mu.Lock()
	defer mesh.mu.Unlock()

	return mesh.self
}

// Roster returns a copy in join order.
func (mesh *Mesh) Roster() peer.ShareRoster {
	mesh.mu.Lock()
	defer mesh.mu.Unlock()

	return mesh.rosterLocked()
}

func (mesh *Mesh) rosterLocked() peer.ShareRoster {
	roster := peer.ShareRoster{Members: make([]peer.ShareMember, 0, len(mesh.members))}
	for _, member := range mesh.members {
		roster.Members = append(roster.Members, member)
	}
	sort.Slice(roster.Members, func(i, j int) bool {
		return roster.Members[i].JoinOrder < roster.Members[j].JoinOrder
	})
	return roster
}

// SetRoster installs the admitter's initial roster before any links are opened.
// It refuses missing self, duplicate identities/orders and mismatched addresses.
func (mesh *Mesh) SetRoster(roster peer.ShareRoster) error {
	mesh.mu.Lock()
	defer mesh.mu.Unlock()

	if mesh.closed || len(mesh.expected) != 0 || len(mesh.outgoing) != 0 || mesh.pending != nil {
		return invalid()
	}
	members, err := validateRoster(roster)
	if err != nil {
		return err
	}
	self, ok := members[mesh.self.ID]
	if !ok || self.Address != mesh.self.Address {
		return invalid()
	}

	mesh.members = members
	mesh.self = self
	if mesh.used == nil {
		mesh.used = make(map[key.NodePublic]bool)
	}
	for _, member := range members {
		public, _ := publicKey(member.ID)
		mesh.used[public] = true
		mesh.lastOrder = max(mesh.lastOrder, member.JoinOrder)
	}
	return nil
}

// RegisterPeer binds a control peer to an identity already authenticated by a link.
// Admission uses these peers to prepare each existing member before the joiner dials.
func (mesh *Mesh) RegisterPeer(id string, control *peer.Peer) error {
	mesh.mu.Lock()
	defer mesh.mu.Unlock()

	if mesh.closed || control == nil || id == mesh.self.ID {
		return invalid()
	}
	if _, ok := mesh.members[id]; !ok {
		return invalid()
	}
	mesh.confirmLocked(id)
	mesh.controls[id] = control
	return nil
}

// Remove forgets only this member and its expected keys. Tailcat's growing
// allowlist remains, so Accept also checks current membership on every stream.
func (mesh *Mesh) Remove(id string) error {
	mesh.mu.Lock()
	defer mesh.mu.Unlock()

	if id == mesh.self.ID {
		return invalid()
	}
	if _, ok := mesh.members[id]; !ok {
		return invalid()
	}
	mesh.removeLocked(id)
	return nil
}

func (mesh *Mesh) removeLocked(id string) {
	mesh.confirmLocked(id)
	delete(mesh.members, id)
	control := mesh.controls[id]
	delete(mesh.controls, id)
	delete(mesh.pendingControls, id)
	if control != nil {
		go control.Close()
	}
	for conn := range mesh.incoming[id] {
		_ = conn.Close()
	}
	delete(mesh.incoming, id)
	if tunnel := mesh.tunnels[id]; tunnel != nil {
		close(tunnel.done)
		delete(mesh.tunnels, id)
	}
	for public, memberID := range mesh.expected {
		if memberID == id {
			delete(mesh.expected, public)
		}
	}
	if link := mesh.outgoing[id]; link != nil {
		_ = link.Close()
		delete(mesh.outgoing, id)
	}
}

func (mesh *Mesh) admitterLocked() string {
	var first peer.ShareMember
	for _, member := range mesh.members {
		if first.ID == "" || member.JoinOrder < first.JoinOrder {
			first = member
		}
	}
	return first.ID
}

// Close stops the server and every outgoing link. It is safe to call again.
func (mesh *Mesh) Close() error {
	mesh.mu.Lock()
	if mesh.closed {
		mesh.mu.Unlock()
		return nil
	}
	mesh.closed = true
	if mesh.stop != nil {
		mesh.stop()
	}
	if mesh.pending != nil {
		mesh.pending.timer.Stop()
		mesh.pending = nil
	}
	for id := range mesh.expiry {
		mesh.confirmLocked(id)
	}
	for id := range mesh.members {
		if id != mesh.self.ID {
			mesh.removeLocked(id)
		}
	}
	for _, link := range mesh.outgoing {
		_ = link.Close()
	}
	mesh.mu.Unlock()
	return mesh.server.Close()
}

// LinkTimeout bounds silent unlisted-key failures as well as unavailable peers.
const LinkTimeout = 15 * time.Second

func quietLog(string, ...any) {}

// IsAdmitter reports whether this member has the lowest join order, the one that admits.
func (mesh *Mesh) IsAdmitter() bool {
	mesh.mu.Lock()
	defer mesh.mu.Unlock()
	return !mesh.closed && mesh.admitterLocked() == mesh.self.ID
}
