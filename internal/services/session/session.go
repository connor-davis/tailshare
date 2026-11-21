// Package session connects members by a short share code and local admission.
package session

import (
	"context"
	"net"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/connor-davis/tailshare/internal/services/mesh"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/tailscale/tailcat"
	"tailscale.com/tailcfg"
)

const (
	sessionPort = 80
	allowWindow = 60 * time.Second
	lostGrace   = 15 * time.Second
	// leaveWait bounds how long Leave waits for members to see its notice.
	leaveWait = 2 * time.Second
)

// Options supplies the room space and handlers before any control peer starts.
type Options struct {
	// Code optionally preselects the host code so its room root can open first.
	Code codes.Code
	// RoomName is the host's name for the room, at most 64 characters. A
	// joiner leaves it empty and learns it from the host.
	RoomName string
	Root     *share.Root
	Handlers map[string]peer.Handler
}

// PendingJoin is one person waiting for the local Allow or Deny.
type PendingJoin struct {
	// ID is a counter for this share, not a wire identity.
	ID uint64 `json:"id"`
	// DisplayName comes from hello, at most 64 characters.
	DisplayName string `json:"displayName"`
	Fingerprint string `json:"fingerprint,omitempty"`
}

// Session owns membership, control peers and the code server for one share.
type Session struct {
	mu         sync.Mutex
	mesh       *mesh.Mesh
	server     *tailcat.Server
	listener   net.Listener
	timer      *time.Timer
	closed     bool
	done       chan struct{}
	changes    chan struct{}
	ctx        context.Context
	cancel     context.CancelFunc
	settings   settings
	code       codes.Code
	controls   map[string]*peer.Peer
	bootstraps map[net.Conn]struct{}
	gate       *joinGate
	nextJoin   uint64
	deniedKeys map[string]time.Time
	roomName   string
}

type settings struct {
	regionID    tailcfg.DERPRegionID
	mapURL      string
	region      *tailcfg.DERPRegion
	derpMap     *tailcfg.DERPMap
	expiry      time.Duration
	name        string
	allowWindow time.Duration
	lostGrace   time.Duration
	options     Options
}

func newSession(ctx context.Context, options settings, code codes.Code) (*Session, error) {
	network, err := mesh.New(ctx, mesh.Options{
		DisplayName: options.name, RegionID: options.regionID,
		Region: options.region, DERPMapURL: options.mapURL,
	})
	if err != nil {
		return nil, err
	}
	if _, err := mergeHandlers(network.Handlers(""), options.options.Handlers); err != nil {
		_ = network.Close()
		return nil, err
	}

	copied, _ := mergeHandlers(nil, options.options.Handlers)
	options.options.Handlers = copied
	lifetime, cancel := context.WithCancel(ctx)
	session := &Session{
		mesh: network, done: make(chan struct{}), changes: make(chan struct{}, 1),
		ctx: lifetime, cancel: cancel, settings: options, code: code, roomName: options.options.RoomName,
		deniedKeys: make(map[string]time.Time), controls: make(map[string]*peer.Peer), bootstraps: make(map[net.Conn]struct{}),
	}
	go session.acceptMesh()
	go func() {
		<-lifetime.Done()
		_ = session.Close()
	}()
	return session, nil
}

// Members returns a roster snapshot in join order, or an empty roster after close.
func (session *Session) Members() []peer.ShareMember {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return nil
	}
	return session.mesh.Roster().Members
}

// RoomName is the host's name for the room. A joiner has it once Join returns.
func (session *Session) RoomName() string {
	session.mu.Lock()
	defer session.mu.Unlock()

	return session.roomName
}

// SelfID is this computer's member ID in the roster, or empty after close.
func (session *Session) SelfID() string {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return ""
	}
	return session.mesh.Self().ID
}

// Pending returns the current local prompt, if any.
func (session *Session) Pending() (PendingJoin, bool) {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed || session.gate == nil || session.gate.decided {
		return PendingJoin{}, false
	}
	return session.gate.pending, true
}

// Changes signals that callers should read the current state again. Signals coalesce.
func (session *Session) Changes() <-chan struct{} { return session.changes }

// Done closes when the share ends on this computer.
func (session *Session) Done() <-chan struct{} { return session.done }

func (session *Session) changedLocked() {
	select {
	case session.changes <- struct{}{}:
	default:
	}
}

// Control returns a current member's control conversation.
func (session *Session) Control(id string) (*peer.Peer, bool) {
	session.mu.Lock()
	defer session.mu.Unlock()
	control, ok := session.controls[id]
	present := false
	for _, member := range session.mesh.Roster().Members {
		if member.ID == id {
			present = true
		}
	}
	return control, ok && present && !session.closed
}

// Tunnel returns a member's data stream tunnel.
func (session *Session) Tunnel(id string) (*mesh.Tunnel, bool) {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return nil, false
	}
	return session.mesh.Tunnel(id)
}

// Leave delivers a leave event before releasing the local share.
func (session *Session) Leave() error {
	session.mu.Lock()
	controls := make([]*peer.Peer, 0, len(session.controls))
	for _, control := range session.controls {
		controls = append(controls, control)
	}
	session.mu.Unlock()

	for _, control := range controls {
		_ = control.Notify(peer.MethodShareLeave, peer.ShareLeave{})
	}

	// Closing the tunnel at once can drop the leave notice in flight. Each
	// member closes its side when the notice arrives, so wait for that, briefly.
	wait := time.NewTimer(leaveWait)
	defer wait.Stop()
	for _, control := range controls {
		select {
		case <-control.Done():
		case <-wait.C:
			return session.Close()
		}
	}
	return session.Close()
}

// Close releases all local resources. Calling it again is safe.
func (session *Session) Close() error {
	session.mu.Lock()
	if session.closed {
		session.mu.Unlock()
		return nil
	}

	session.closed = true
	session.code = ""
	close(session.done)
	session.cancel()
	if session.timer != nil {
		session.timer.Stop()
	}
	if session.gate != nil && !session.gate.decided {
		session.decideLocked(session.gate, denied())
	}

	var admission *mesh.Admission
	if session.gate != nil {
		admission = session.gate.admission
		session.gate = nil
	}

	server, listener := session.server, session.listener
	controls := session.controls
	session.controls = make(map[string]*peer.Peer)
	for conn := range session.bootstraps {
		_ = conn.Close()
	}
	session.changedLocked()
	session.mu.Unlock()

	if admission != nil {
		admission.Close()
	}

	if listener != nil {
		_ = listener.Close()
	}
	if server != nil {
		_ = server.Close()
	}
	_ = session.mesh.Close()
	for _, control := range controls {
		_ = control.Close()
	}
	return nil
}
