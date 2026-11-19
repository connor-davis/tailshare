package api

import (
	"encoding/json"
	"os"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/platform/apperr"
	"github.com/Polyphron-AI/tailshare/internal/services/codes"
	"github.com/Polyphron-AI/tailshare/internal/services/peer"
	"github.com/Polyphron-AI/tailshare/internal/services/session"
	"github.com/Polyphron-AI/tailshare/internal/services/share"
	"github.com/Polyphron-AI/tailshare/internal/services/transfer"
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

	// How long hello may take once the stream exists, and how long a join
	// may take in all.
	helloTimeout = 30 * time.Second
	joinTimeout  = 60 * time.Second
)

// SessionState is what the screen knows about the session. The code is shown
// only while hosting.
type SessionState struct {
	State string    `json:"state"`
	Role  string    `json:"role,omitempty"`
	Code  string    `json:"code,omitempty"`
	Peer  *PeerInfo `json:"peer,omitempty"`
}

// PeerInfo is what the other computer said about itself.
type PeerInfo struct {
	DisplayName      string `json:"displayName"`
	SharedFolderName string `json:"sharedFolderName"`
}

func (server *Server) sessionState() SessionState {
	server.mu.Lock()
	defer server.mu.Unlock()

	return server.stateLocked()
}

func (server *Server) stateLocked() SessionState {
	state := SessionState{State: server.phase, Role: server.role}
	if server.phase == phaseHosting {
		state.Code = server.code
	}
	if server.phase == phaseConnected {
		remote := server.peer.Remote()
		state.Peer = &PeerInfo{DisplayName: remote.DisplayName, SharedFolderName: remote.SharedFolderName}
	}

	return state
}

func (server *Server) publishSession() {
	server.hub.publish("session.state", server.sessionState())
}

func (server *Server) getSession(c fiber.Ctx) error {
	return c.JSON(server.sessionState())
}

// reserve claims the idle session for a host or join, so a second request
// gets a conflict while the first is still setting up. It hands back the
// shared folder, which cannot change until the session ends.
func (server *Server) reserve(role string) (*share.Root, error) {
	server.mu.Lock()
	defer server.mu.Unlock()

	if server.phase != phaseIdle {
		return nil, apperr.Conflict("conflict", "A session is already open. Leave it first.")
	}
	if server.root == nil {
		return nil, errNoFolder()
	}

	server.phase = phaseConnecting
	server.role = role

	return server.root, nil
}

// release undoes reserve after a failed setup.
func (server *Server) release() {
	server.mu.Lock()
	server.phase = phaseIdle
	server.role = ""
	server.mu.Unlock()

	server.publishSession()
}

func (server *Server) hostSession(c fiber.Ctx) error {
	root, err := server.reserve(roleHost)
	if err != nil {
		return err
	}

	sess, code, err := session.Host(server.ctx, server.cfg)
	if err != nil {
		server.release()
		return apperr.Unavailable(err.Error())
	}

	server.mu.Lock()
	server.sess = sess
	server.code = code.String()
	server.phase = phaseHosting
	server.mu.Unlock()

	server.publishSession()
	go server.awaitJoiner(sess, root)

	return c.Status(fiber.StatusCreated).JSON(server.sessionState())
}

// awaitJoiner waits for the one joiner to open its stream, then says hello.
// If the code expires or the host leaves first, Accept fails and we go idle.
func (server *Server) awaitJoiner(sess *session.Session, root *share.Root) {
	conn, err := sess.Accept()
	if err != nil {
		server.end(sess)
		return
	}

	ctx, cancel := server.contextWithin(helloTimeout)
	defer cancel()

	manager := transfer.New(root)
	other, err := peer.Start(ctx, conn, peer.Options{
		DisplayName: displayName(), Share: root, Handlers: manager.Handlers(),
	})
	if err != nil {
		_ = manager.Close()
		server.end(sess)
		return
	}

	server.connect(sess, other, manager, true)
}

func (server *Server) joinSession(c fiber.Ctx) error {
	var in struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(c.Body(), &in); err != nil {
		return apperr.BadRequest("The request could not be understood.")
	}

	if _, err := codes.Parse(in.Code); err != nil {
		return apperr.BadRequest(err.Error())
	}

	root, err := server.reserve(roleJoiner)
	if err != nil {
		return err
	}

	ctx, cancel := server.contextWithin(joinTimeout)
	defer cancel()

	sess, err := session.Join(ctx, in.Code, server.cfg)
	if err != nil {
		server.release()
		return apperr.Unavailable(err.Error())
	}

	conn, err := sess.Open(ctx)
	if err != nil {
		_ = sess.Close()
		server.release()

		return apperr.Unavailable(err.Error())
	}

	manager := transfer.New(root)
	other, err := peer.Start(ctx, conn, peer.Options{
		DisplayName: displayName(), Share: root, Handlers: manager.Handlers(),
	})
	if err != nil {
		_ = manager.Close()
		_ = sess.Close()
		server.release()

		return apperr.Unavailable(err.Error())
	}

	server.mu.Lock()
	server.sess = sess
	server.mu.Unlock()

	server.connect(sess, other, manager, false)

	return c.JSON(server.sessionState())
}

// connect records the open conversation and starts watching it. If the
// session was left in the meantime, the peer is simply closed.
func (server *Server) connect(
	sess *session.Session,
	other *peer.Peer,
	manager *transfer.Manager,
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

	if err := manager.Attach(server.ctx, sess, other, host); err != nil {
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
	server.code = ""
	server.phase = phaseConnected
	server.mu.Unlock()

	server.publishSession()

	chatEvents := other.Subscribe()
	go func() {
		for event := range chatEvents.Events {
			if event.Kind == peer.EventChat {
				server.hub.publish("chat.message", event.Chat)
			}
		}
	}()

	go func() {
		<-other.Done()
		server.end(sess)
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

// leave closes the session and peer and goes idle. The shared folder stays.
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
	ending := make(chan struct{})
	server.ending = ending
	server.phase = phaseConnecting
	server.transfers = nil
	server.mu.Unlock()

	if closer, ok := transfers.(interface{ Close() error }); ok {
		_ = closer.Close()
	}
	if done != nil {
		<-done
	}
	if other != nil {
		_ = other.Close()
	}
	_ = sess.Close()

	server.mu.Lock()
	server.sess, server.peer = nil, nil
	server.phase, server.role, server.code = phaseIdle, "", ""
	server.transferDone = nil
	server.ending = nil
	close(ending)
	server.mu.Unlock()

	server.publishSession()
}

// displayName is how this computer introduces itself to the other one.
func displayName() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "Tailshare"
	}

	return name[:min(len(name), 64)]
}
