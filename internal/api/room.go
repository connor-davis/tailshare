package api

import (
	"encoding/json"
	"sort"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/connor-davis/tailshare/internal/services/forward"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/services/transfer"
	"github.com/gofiber/fiber/v3"
)

// room keeps one session's state together. Server.mu guards its fields and membership.
type room struct {
	phase        string
	role         string
	code         string
	roomName     string
	sess         *session.Session
	peer         *peer.Peer
	root         *share.Root
	manager      *transfer.Manager
	transfers    Transfers
	transferDone chan struct{}
	ending       chan struct{}
	forwards     *forward.Forwards
}

// activeLocked returns nil when no room is selected. The caller holds Server.mu.
func (server *Server) activeLocked() *room {
	return server.rooms[server.active]
}

// sessionRoomLocked finds the owning room even when another room is selected.
func (server *Server) sessionRoomLocked(sess *session.Session) *room {
	if sess == nil {
		return nil
	}

	for _, current := range server.rooms {
		if current.sess == sess {
			return current
		}
	}
	return nil
}

// forgetRoomLocked removes only this reservation, so stale work cannot remove its replacement.
func (server *Server) forgetRoomLocked(current *room) {
	if server.rooms[current.code] != current {
		return
	}

	delete(server.rooms, current.code)
	if server.active == current.code {
		server.active = ""
		for code := range server.rooms {
			if server.active == "" || code < server.active {
				server.active = code
			}
		}
	}
}

// roomFor is the one way a handler learns which room a request is about: the
// room query, or the room field of a POST or PUT body. Empty means the active
// room, which may be nil when none is open.
func (server *Server) roomFor(c fiber.Ctx) (*room, error) {
	code := c.Query("room")
	if code == "" && (c.Method() == fiber.MethodPost || c.Method() == fiber.MethodPut) {
		var in struct {
			Room string `json:"room"`
		}
		// A body that is not JSON is the handler's own error to report.
		_ = json.Unmarshal(c.Body(), &in)
		code = in.Room
	}

	return server.roomByCode(code)
}

// roomByCode looks a room up by any spelling of its code. Empty means the active room.
func (server *Server) roomByCode(code string) (*room, error) {
	server.mu.Lock()
	defer server.mu.Unlock()

	if code == "" {
		return server.activeLocked(), nil
	}

	parsed, err := codes.Parse(code)
	if err != nil {
		return nil, apperr.BadRequest("That room code is not valid.")
	}

	current := server.rooms[parsed.String()]
	if current == nil {
		return nil, apperr.NotFound("That room is not open.")
	}

	return current, nil
}

// roomsState lists every open room by code, with the active room's code.
func (server *Server) roomsState() (string, []SessionState) {
	server.mu.Lock()
	defer server.mu.Unlock()

	keys := make([]string, 0, len(server.rooms))
	for code := range server.rooms {
		keys = append(keys, code)
	}
	sort.Strings(keys)

	states := make([]SessionState, 0, len(keys))
	for _, code := range keys {
		states = append(states, server.roomStateLocked(server.rooms[code]))
	}

	return server.active, states
}

func (server *Server) listRooms(c fiber.Ctx) error {
	active, rooms := server.roomsState()

	return c.JSON(fiber.Map{"active": active, "rooms": rooms})
}

// putActiveRoom picks which open room the screen shows.
func (server *Server) putActiveRoom(c fiber.Ctx) error {
	var in struct {
		Room string `json:"room"`
	}
	if json.Unmarshal(c.Body(), &in) != nil || in.Room == "" {
		return apperr.BadRequest("Say which room to show.")
	}

	current, err := server.roomByCode(in.Room)
	if err != nil {
		return err
	}

	server.mu.Lock()
	if server.rooms[current.code] != current {
		server.mu.Unlock()
		return apperr.NotFound("That room is not open.")
	}
	server.active = current.code
	server.mu.Unlock()

	server.publishSession(current)

	return c.JSON(server.sessionState())
}

// publishActiveSession announces the fallback after a room is removed.
func (server *Server) publishActiveSession() {
	server.mu.Lock()
	current := server.activeLocked()
	server.mu.Unlock()

	if current != nil {
		server.publishSession(current)
	}
}
