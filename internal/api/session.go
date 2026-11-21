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
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/services/transfer"
	"github.com/gofiber/fiber/v3"
)

// The phases of the one session: idle, then connecting (a host or join is
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
	// State is the phase: idle, connecting, hosting or connected.
	State string `json:"state"`
	// Role is host or joiner. Empty while idle.
	Role string `json:"role,omitempty"`
	Code string `json:"code,omitempty"`
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
	ID          string `json:"id"`
	Fingerprint string `json:"fingerprint,omitempty"`
	DisplayName string `json:"displayName"`
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
	state := SessionState{State: server.phase, Role: server.role, RoomName: server.roomName}
	if server.phase == phaseHosting {
		state.Code = server.code
	}
	if server.phase == phaseConnected {
		remote := server.peer.Remote()
		state.Peer = &PeerInfo{DisplayName: remote.DisplayName, SharedFolderName: remote.SharedFolderName}
	}

	if server.sess != nil {
		if pending, ok := server.sess.Pending(); ok {
			state.Join = &pending
		}

		selfID := server.sess.SelfID()
		for index, member := range server.sess.Members() {
			state.Members = append(state.Members, MemberInfo{
				ID: member.ID, DisplayName: member.DisplayName, Fingerprint: peer.Fingerprint(member.ID),
				Host: index == 0, You: member.ID == selfID,
			})
		}
	}
	return state
}

func (server *Server) publishSession() {
	server.syncRoomFeatures()
	server.hub.publish("session.state", server.sessionState())
}

func (server *Server) getSession(c fiber.Ctx) error {
	return c.JSON(server.sessionState())
}

// reserve claims the idle session for a host or join, so a second request
// gets a conflict while the first is still setting up. It opens that code's
// persistent room folder, which stays reserved until the session ends.
func (server *Server) reserve(role string, code codes.Code) (*share.Root, error) {
	server.mu.Lock()
	defer server.mu.Unlock()

	if server.phase != phaseIdle {
		return nil, apperr.Conflict("conflict", "A session is already open. Leave it first.")
	}
	root, err := server.openRoom(code)
	if err != nil {
		return nil, err
	}
	server.root = root

	server.phase = phaseConnecting
	server.role = role

	return server.root, nil
}

// release undoes reserve after a failed setup.
func (server *Server) release() {
	server.roomIO.Lock()
	defer server.roomIO.Unlock()

	server.mu.Lock()
	if server.root != nil {
		_ = server.root.Close()
		server.root = nil
	}
	server.manager = nil
	forwards := server.forwards
	screens := server.screens
	server.screens = nil
	server.forwards = nil
	server.phase = phaseIdle
	server.role = ""
	server.roomName = ""
	server.mu.Unlock()

	if screens != nil {
		screens.Close()
	}

	if forwards != nil {
		forwards.Close()
	}

	server.publishSession()
}

func (server *Server) hostSession(c fiber.Ctx) error {
	var in struct {
		DisplayName string `json:"displayName"`
		RoomName    string `json:"roomName"`
	}
	// An empty body is fine: the computer name stands in.
	if len(c.Body()) > 0 && json.Unmarshal(c.Body(), &in) != nil {
		return apperr.BadRequest("The request could not be understood.")
	}

	selected := codes.New()
	root, err := server.reserve(roleHost, selected)
	if err != nil {
		return err
	}

	manager := server.roomManager(root)
	forwards := server.newForwards()
	screens := server.newScreens()
	host := displayName(in.DisplayName)
	// ponytail: the name is fixed when the room is created; renaming later is not built.
	room := roomName(in.RoomName, host)
	sess, code, err := session.Host(server.ctx, server.cfg, host, session.Options{
		Root: root, Handlers: manager.Handlers(), Code: selected, RoomName: room,
		RoomHandlers: roomHandlers(forwards.RoomHandlers(), screens.RoomHandlers()),
	})
	if err != nil {
		forwards.Close()
		screens.Close()
		_ = manager.Close()
		server.release()
		return connectError(err)
	}

	server.mu.Lock()
	server.sess = sess
	server.code = code.String()
	server.roomName = room
	server.phase = phaseHosting
	server.mu.Unlock()

	server.attachScreens(sess, screens)
	server.attachForwards(sess, forwards)
	server.publishSession()
	go server.awaitJoiner(sess, manager)

	return c.Status(fiber.StatusCreated).JSON(server.sessionState())
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

		server.publishSession()
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
			server.publishSession()
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

	manager := server.roomManager(root)
	forwards := server.newForwards()
	screens := server.newScreens()
	sess, err := session.Join(ctx, in.Code, server.cfg, displayName(in.DisplayName), session.Options{
		Root: root, Handlers: manager.Handlers(),
		RoomHandlers: roomHandlers(forwards.RoomHandlers(), screens.RoomHandlers()),
	})
	if err != nil {
		forwards.Close()
		screens.Close()
		_ = manager.Close()
		server.release()
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
		screens.Close()
		_ = manager.Close()
		_ = sess.Close()
		server.release()
		return errUnreachable()
	}

	server.mu.Lock()
	server.sess = sess
	server.roomName = sess.RoomName()
	server.mu.Unlock()

	server.attachScreens(sess, screens)
	server.attachForwards(sess, forwards)
	server.connect(sess, other, manager, memberID, false)
	go server.watchSession(sess)

	return c.JSON(server.sessionState())
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
	if server.sess != sess || server.ending != nil || server.ctx.Err() != nil {
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
	server.transfers = adapter
	events, stop := adapter.Subscribe()
	server.transferDone = make(chan struct{})
	done := server.transferDone
	go func() {
		defer close(done)
		server.forwardTransfers(events, stop)
	}()

	server.peer = other
	server.phase = phaseConnected
	server.mu.Unlock()

	server.publishSession()

	chatEvents := other.Subscribe()
	go server.forwardChat(other, chatEvents)

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
	server.mu.Lock()
	connecting := server.phase == phaseConnecting
	server.mu.Unlock()

	if connecting {
		return apperr.Conflict("conflict", "The session is still starting. Try again in a moment.")
	}

	server.leave()

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
	if expected != nil && server.sess != expected {
		server.mu.Unlock()
		return
	}
	if ending := server.ending; ending != nil {
		server.mu.Unlock()
		<-ending
		return
	}

	sess, other := server.sess, server.peer
	if sess == nil {
		server.mu.Unlock()
		return
	}
	transfers, done := server.transfers, server.transferDone
	manager := server.manager
	forwards := server.forwards
	screens := server.screens
	server.screens = nil
	server.forwards = nil
	ending := make(chan struct{})
	server.ending = ending
	server.phase = phaseConnecting
	server.transfers = nil
	server.mu.Unlock()

	if screens != nil {
		screens.Close()
	}

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
	_ = sess.Leave()
	if other != nil {
		_ = other.Close()
	}

	server.roomIO.Lock()
	defer server.roomIO.Unlock()

	server.mu.Lock()
	server.sess, server.peer = nil, nil
	server.phase, server.role, server.code, server.roomName = phaseIdle, "", "", ""
	server.transferDone = nil
	if server.root != nil {
		_ = server.root.Close()
		server.root = nil
	}
	server.manager = nil
	server.pruneDownloadRootsLocked()
	server.ending = nil
	close(ending)
	server.mu.Unlock()

	server.publishSession()
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

func (server *Server) forwardChat(other *peer.Peer, subscription *peer.Subscription) {
	defer func() { subscription.Close() }()
	var last int64
	for {
		for event := range subscription.Events {
			if event.Kind == peer.EventChat && event.Chat.Seq > last {
				last = event.Chat.Seq
				server.hub.publish("chat.message", event.Chat)
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
		for _, message := range subscription.Snapshot {
			if message.Seq > last {
				last = message.Seq
				server.hub.publish("chat.message", message)
			}
		}
	}
}
