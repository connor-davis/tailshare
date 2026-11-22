package api

import (
	"encoding/json"
	"os"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/connor-davis/tailshare/internal/services/mesh"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/services/transfer"
	"github.com/gofiber/fiber/v3"
)

// The phases of each session: idle, then connecting (a host or join is
// being set up), then hosting (waiting for the joiner) or connected.
const (
	phaseIdle       = "idle"
	phaseConnecting = "connecting"
	phaseHosting    = "hosting"
	phaseConnected  = "connected"

	roleHost   = "host"
	roleJoiner = "joiner"

	// Leave room for the local prompt and link preparation.
	joinTimeout = 90 * time.Second
)

// SessionState is what the screen knows about the session. The code is shown
// only while hosting.
type SessionState struct {
	// Room is the room's canonical code, for every role and phase. Empty only when no room exists.
	Room string `json:"room,omitempty"`
	// State is the phase: idle, connecting, hosting or connected.
	State string `json:"state"`
	// Role is host or joiner. Empty while idle.
	Role string `json:"role,omitempty"`
	Code string `json:"code,omitempty"`
	// ExpiresAt is when the unused code stops working, in RFC 3339. It is left out once
	// someone has joined, because the code then no longer expires.
	ExpiresAt string `json:"expiresAt,omitempty"`
	// RoomName is the host's name for the room: the host's own, or the one
	// the host sent a joiner. At most 64 characters.
	RoomName string `json:"roomName,omitempty"`
	// Peer is nil until the other computer has connected.
	Peer *PeerInfo `json:"peer,omitempty"`
	// Join is present only while someone is waiting for local approval.
	Join *session.PendingJoin `json:"join,omitempty"`
	// Members is the roster in join order while hosting or connected. The
	// host comes first.
	Members []MemberInfo `json:"members,omitempty"`
}

// MemberInfo is one person in the share, as the screen shows them. Addresses
// and keys never leave the sidecar.
type MemberInfo struct {
	Path        *mesh.Path `json:"path,omitempty"`
	ID          string     `json:"id"`
	Fingerprint string     `json:"fingerprint,omitempty"`
	DisplayName string     `json:"displayName"`
	// Host is true for the computer that admitted everyone else.
	Host bool `json:"host,omitempty"`
	// You is true for this computer.
	You bool `json:"you,omitempty"`
}

// PeerInfo is what the other computer said about itself.
type PeerInfo struct {
	// DisplayName is at most 64 characters.
	DisplayName string `json:"displayName"`
	// SharedFolderName is at most 255 characters.
	SharedFolderName string `json:"sharedFolderName"`
}

func (server *Server) sessionState() SessionState {
	server.mu.Lock()
	defer server.mu.Unlock()

	return server.stateLocked()
}

func (server *Server) stateLocked() SessionState {
	return server.roomStateLocked(server.activeLocked())
}

func (server *Server) roomStateLocked(current *room) SessionState {
	if current == nil {
		return SessionState{State: phaseIdle}
	}

	state := SessionState{
		Room: current.code, State: current.phase, Role: current.role, RoomName: current.roomName,
	}
	if current.phase == phaseHosting {
		state.Code = current.code
		if current.sess != nil {
			if expires, ok := current.sess.ExpiresAt(); ok {
				state.ExpiresAt = expires.UTC().Format(time.RFC3339)
			}
		}
	}
	if current.phase == phaseConnected {
		remote := current.peer.Remote()
		state.Peer = &PeerInfo{DisplayName: remote.DisplayName, SharedFolderName: remote.SharedFolderName}
	}

	if current.sess != nil {
		if pending, ok := current.sess.Pending(); ok {
			state.Join = &pending
		}

		selfID := current.sess.SelfID()
		for index, member := range current.sess.Members() {
			state.Members = append(state.Members, MemberInfo{
				ID: member.ID, DisplayName: member.DisplayName, Fingerprint: peer.Fingerprint(member.ID),
				Host: index == 0, You: member.ID == selfID, Path: current.sess.Path(member.ID),
			})
		}
	}
	return state
}

// publishSession syncs one room's apps and sends its state, tagged with its code.
func (server *Server) publishSession(current *room) {
	server.mu.Lock()
	forwards := current.forwards
	server.mu.Unlock()

	if forwards != nil {
		forwards.Sync()
	}

	server.mu.Lock()
	state := server.roomStateLocked(current)
	server.mu.Unlock()

	server.hub.publishRoom(current.code, "session.state", state)
}

// publishSessionFor ignores retired watchers and synchronizes the owning room's apps.
func (server *Server) publishSessionFor(sess *session.Session) {
	server.mu.Lock()
	current := server.sessionRoomLocked(sess)
	if current == nil {
		server.mu.Unlock()
		return
	}

	forwards := current.forwards
	server.mu.Unlock()

	if forwards != nil {
		forwards.Sync()
	}

	server.mu.Lock()
	if server.rooms[current.code] != current || current.sess != sess {
		server.mu.Unlock()
		return
	}

	state := server.roomStateLocked(current)
	server.mu.Unlock()

	server.hub.publishRoom(current.code, "session.state", state)
}

func (server *Server) getSession(c fiber.Ctx) error {
	current, err := server.roomFor(c)
	if err != nil {
		return err
	}

	server.mu.Lock()
	defer server.mu.Unlock()

	return c.JSON(server.roomStateLocked(current))
}

// reserve claims a code for a host or join, so a duplicate request
// gets a conflict while the first is still setting up. It opens that code's
// persistent room folder, which stays reserved until the session ends.
func (server *Server) reserve(role string, code codes.Code) (*share.Root, error) {
	server.mu.Lock()
	defer server.mu.Unlock()

	if server.rooms[code.String()] != nil {
		return nil, apperr.Conflict("conflict", "That room is already open.")
	}

	root, err := server.openRoom(code)
	if err != nil {
		return nil, err
	}

	current := &room{code: root.Name(), root: root, phase: phaseConnecting, role: role}
	server.rooms[current.code] = current
	server.active = current.code

	return root, nil
}

// release undoes reserve after a failed setup.
func (server *Server) release() {
	server.mu.Lock()
	current := server.activeLocked()
	server.mu.Unlock()

	server.releaseRoom(current)
}

func (server *Server) releaseRoom(current *room) {
	server.roomIO.Lock()
	defer server.roomIO.Unlock()

	server.mu.Lock()
	if current == nil || server.rooms[current.code] != current {
		server.mu.Unlock()
		return
	}
	if current.root != nil {
		_ = current.root.Close()
		current.root = nil
	}
	current.manager = nil
	forwards := current.forwards
	current.forwards = nil
	current.phase = phaseIdle
	current.role = ""
	current.roomName = ""
	server.forgetRoomLocked(current)
	server.mu.Unlock()

	if forwards != nil {
		forwards.Close()
	}

	server.publishSession(current)
	server.publishActiveSession()
}

func (server *Server) hostSession(c fiber.Ctx) error {
	var in struct {
		DisplayName string `json:"displayName"`
		RoomName    string `json:"roomName"`
		// Code reopens an earlier room: the same code, so its folder and link come back.
		Code string `json:"code"`
	}
	// An empty body is fine: the computer name stands in.
	if len(c.Body()) > 0 && json.Unmarshal(c.Body(), &in) != nil {
		return apperr.BadRequest("The request could not be understood.")
	}

	selected := codes.New()
	if in.Code != "" {
		// Every join still needs the host's Allow, so reusing a code opens no new door.
		parsed, err := codes.Parse(in.Code)
		if err != nil {
			return apperr.BadRequest("That room code is not valid.")
		}
		selected = parsed
	}
	root, err := server.reserve(roleHost, selected)
	if err != nil {
		return err
	}

	current, manager, err := server.roomManager(root)
	if err != nil {
		server.releaseRoom(current)
		return err
	}

	forwards := server.newForwards(current)
	host := displayName(in.DisplayName)
	// ponytail: the name is fixed when the room is created; renaming later is not built.
	room := roomName(in.RoomName, host)
	sess, _, err := session.Host(server.ctx, server.connectionConfig(), host, session.Options{
		Root: root, Handlers: manager.Handlers(), Code: selected, RoomName: room,
		RoomHandlers: forwards.RoomHandlers(), Trusted: server.trusted,
	})
	if err != nil {
		forwards.Close()
		_ = manager.Close()
		server.releaseRoom(current)
		return connectError(err)
	}

	server.mu.Lock()
	if server.rooms[current.code] != current || server.ctx.Err() != nil {
		server.mu.Unlock()
		forwards.Close()
		_ = manager.Close()
		_ = sess.Close()
		server.releaseRoom(current)
		return errNotConnected()
	}

	current.sess = sess
	current.roomName = room
	current.phase = phaseHosting
	server.mu.Unlock()

	server.attachForwards(sess, forwards)
	server.publishSession(current)
	go server.awaitJoiner(sess, manager)

	server.mu.Lock()
	state := server.roomStateLocked(current)
	server.mu.Unlock()

	return c.Status(fiber.StatusCreated).JSON(state)
}

// awaitJoiner publishes prompt changes and connects the first member with a control peer.
func (server *Server) awaitJoiner(sess *session.Session, manager *transfer.Manager) {
	connected := false
	defer func() {
		if !connected {
			_ = manager.Close()
		}
	}()
	for {
		if !connected {
			for _, member := range sess.Members() {
				if other, ok := sess.Control(member.ID); ok {
					server.connect(sess, other, manager, member.ID, true)
					connected = true
					break
				}
			}
		}
		if connected {
			server.watchSession(sess)
			return
		}

		server.publishSessionFor(sess)
		select {
		case <-sess.Done():
			server.end(sess)
			return
		case <-sess.Changes():
		}
	}
}

func (server *Server) watchSession(sess *session.Session) {
	for {
		select {
		case <-sess.Done():
			server.end(sess)
			return
		case <-sess.Changes():
			server.publishSessionFor(sess)
		}
	}
}

func (server *Server) joinSession(c fiber.Ctx) error {
	var in struct {
		Code        string `json:"code"`
		DisplayName string `json:"displayName"`
	}
	if err := json.Unmarshal(c.Body(), &in); err != nil {
		return apperr.BadRequest("The request could not be understood.")
	}

	parsed, err := codes.Parse(in.Code)
	if err != nil {
		return apperr.BadRequest(err.Error())
	}

	root, err := server.reserve(roleJoiner, parsed)
	if err != nil {
		return err
	}

	ctx, cancel := server.contextWithin(joinTimeout)
	defer cancel()

	current, manager, err := server.roomManager(root)
	if err != nil {
		server.releaseRoom(current)
		return err
	}

	forwards := server.newForwards(current)
	sess, err := session.Join(ctx, in.Code, server.connectionConfig(), displayName(in.DisplayName), session.Options{
		Root: root, Handlers: manager.Handlers(),
		RoomHandlers: forwards.RoomHandlers(),
	})
	if err != nil {
		forwards.Close()
		_ = manager.Close()
		server.releaseRoom(current)
		return connectError(err)
	}

	var other *peer.Peer
	var memberID string
	for _, member := range sess.Members() {
		if control, ok := sess.Control(member.ID); ok {
			other, memberID = control, member.ID
			break
		}
	}
	if other == nil {
		forwards.Close()
		_ = manager.Close()
		_ = sess.Close()
		server.releaseRoom(current)
		return errUnreachable()
	}

	server.mu.Lock()
	if server.rooms[current.code] != current || server.ctx.Err() != nil {
		server.mu.Unlock()
		forwards.Close()
		_ = manager.Close()
		_ = sess.Close()
		server.releaseRoom(current)
		return errNotConnected()
	}

	current.sess = sess
	current.roomName = sess.RoomName()
	server.mu.Unlock()

	server.attachForwards(sess, forwards)
	server.connect(sess, other, manager, memberID, false)
	go server.watchSession(sess)

	server.mu.Lock()
	state := server.roomStateLocked(current)
	server.mu.Unlock()

	return c.JSON(state)
}

// connect records the open conversation and starts watching it. If the
// session was left in the meantime, the peer is simply closed.
func (server *Server) connect(
	sess *session.Session,
	other *peer.Peer,
	manager *transfer.Manager,
	memberID string,
	host bool,
) {
	server.mu.Lock()
	current := server.sessionRoomLocked(sess)
	if current == nil || current.sess != sess || current.ending != nil || server.ctx.Err() != nil {
		server.mu.Unlock()
		_ = other.Close()
		_ = manager.Close()
		_ = sess.Close()
		server.end(sess)

		return
	}

	tunnel, ok := sess.Tunnel(memberID)
	if !ok {
		server.mu.Unlock()
		_ = manager.Close()
		server.end(sess)
		return
	}
	if err := manager.Attach(server.ctx, tunnel, other, host); err != nil {
		server.mu.Unlock()
		_ = manager.Close()
		_ = other.Close()
		server.end(sess)
		return
	}

	adapter := newManagedTransfers(manager)
	current.transfers = adapter
	events, stop := adapter.Subscribe()
	current.transferDone = make(chan struct{})
	done := current.transferDone
	go func() {
		defer close(done)
		server.forwardTransfers(current.code, events, stop)
	}()

	current.peer = other
	current.phase = phaseConnected
	server.mu.Unlock()

	server.publishSessionFor(sess)

	chatEvents := other.Subscribe()
	go server.forwardChat(current.code, other, chatEvents)

	go func() {
		<-other.Done()
		server.replacePeer(sess, other, manager)
	}()
}

// end tears down the session if it is still the current one. It is how a
// lost peer, an expired code and a failed hello all end up idle.
func (server *Server) end(sess *session.Session) {
	server.endCurrent(sess)
}

func (server *Server) leaveSession(c fiber.Ctx) error {
	current, err := server.roomFor(c)
	if err != nil {
		return err
	}

	server.mu.Lock()
	connecting := current != nil && current.phase == phaseConnecting
	server.mu.Unlock()

	if connecting {
		return apperr.Conflict("conflict", "The session is still starting. Try again in a moment.")
	}

	server.endRoom(current, nil)

	return c.JSON(server.sessionState())
}

// leave closes the session, peer and root handle. Room files remain on disk.
// Calling it with nothing open does nothing.
func (server *Server) leave() {
	server.endCurrent(nil)
}

// endCurrent keeps the folder reserved until every transfer worker has stopped.
// An expected session prevents an old peer watcher from ending a newer session.
func (server *Server) endCurrent(expected *session.Session) {
	server.mu.Lock()
	current := server.activeLocked()
	if expected != nil {
		current = server.sessionRoomLocked(expected)
	}
	server.mu.Unlock()

	server.endRoom(current, expected)
}

// endRoom keeps cleanup bound to its reservation, even if the active room changes.
func (server *Server) endRoom(current *room, expected *session.Session) {
	server.mu.Lock()
	if current == nil || server.rooms[current.code] != current ||
		(expected != nil && current.sess != expected) {
		server.mu.Unlock()
		return
	}
	if ending := current.ending; ending != nil {
		server.mu.Unlock()
		<-ending
		return
	}

	sess, other := current.sess, current.peer
	transfers, done := current.transfers, current.transferDone
	manager := current.manager
	forwards := current.forwards
	current.forwards = nil
	ending := make(chan struct{})
	current.ending = ending
	current.phase = phaseConnecting
	current.transfers = nil
	server.mu.Unlock()

	if forwards != nil {
		forwards.Close()
	}
	if manager != nil {
		_ = manager.Close()
	}
	if closer, ok := transfers.(interface{ Close() error }); ok {
		_ = closer.Close()
	}
	if done != nil {
		<-done
	}
	if sess != nil {
		_ = sess.Leave()
	}
	if other != nil {
		_ = other.Close()
	}

	server.roomIO.Lock()
	defer server.roomIO.Unlock()

	server.mu.Lock()
	current.sess, current.peer = nil, nil
	current.phase, current.role, current.roomName = phaseIdle, "", ""
	current.transferDone = nil
	if current.root != nil {
		_ = current.root.Close()
		current.root = nil
	}
	current.manager = nil
	server.forgetRoomLocked(current)
	server.pruneDownloadRootsLocked()
	current.ending = nil
	close(ending)
	server.mu.Unlock()

	server.publishSession(current)
	server.publishActiveSession()
}

// displayName is how this computer introduces itself to the other one: the
// name from Settings when it is usable, otherwise the computer name.
func displayName(chosen string) string {
	if name, ok := usableName(chosen); ok {
		return name
	}

	name, err := os.Hostname()
	if err != nil || name == "" {
		return "Tailshare"
	}

	return truncateName(name)
}

// roomName is the room's name: the host's pick when it is usable, otherwise
// "<host>'s room". The default is cut to 64 characters like any name.
func roomName(chosen, host string) string {
	if name, ok := usableName(chosen); ok {
		return name
	}

	fallback := []rune(host + "'s room")

	return string(fallback[:min(len(fallback), 64)])
}

// usableName trims a typed name and says whether it can be shown: valid
// UTF-8, 1 to 64 characters and no control characters.
func usableName(chosen string) (string, bool) {
	chosen = strings.TrimSpace(chosen)
	ok := chosen != "" && utf8.ValidString(chosen) && utf8.RuneCountInString(chosen) <= 64 &&
		!strings.ContainsFunc(chosen, unicode.IsControl)

	return chosen, ok
}

func truncateName(name string) string {
	runes := []rune(name)
	return string(runes[:min(len(runes), 64)])
}

func (server *Server) forwardChat(code string, other *peer.Peer, subscription *peer.Subscription) {
	defer func() { subscription.Close() }()
	var last int64
	for {
		for event := range subscription.Events {
			if event.Kind == peer.EventChat && event.Chat.Seq > last {
				last = event.Chat.Seq
				server.hub.publishRoom(code, "chat.message", event.Chat)
			}
			if event.Kind == peer.EventShare && event.Method == peer.MethodShareChanged {
				server.hub.publishRoom(code, "files.changed", struct{}{})
			}
		}
		select {
		case <-other.Done():
			return
		case <-server.ctx.Done():
			return
		default:
		}
		subscription.Close()
		subscription = other.Subscribe()

		// The cut-off may have dropped a share.changed, so list again to be safe.
		server.hub.publishRoom(code, "files.changed", struct{}{})
		for _, message := range subscription.Snapshot {
			if message.Seq > last {
				last = message.Seq
				server.hub.publishRoom(code, "chat.message", message)
			}
		}
	}
}
