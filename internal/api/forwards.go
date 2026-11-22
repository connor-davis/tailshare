package api

import (
	"encoding/json"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/forward"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/gofiber/fiber/v3"
)

// newForwards makes the room's port forwards. Their changes go to the live socket.
func (server *Server) newForwards(current *room) *forward.Forwards {
	return forward.New(func() {
		server.hub.publishRoom(current.code, "forward.changed", server.roomForwardState(current))
	})
}

// attachForwards starts the forwards on a new session and keeps them for its lifetime.
func (server *Server) attachForwards(sess *session.Session, forwards *forward.Forwards) {
	server.mu.Lock()
	current := server.sessionRoomLocked(sess)
	if current == nil {
		server.mu.Unlock()
		forwards.Close()
		return
	}

	current.forwards = forwards
	server.mu.Unlock()

	if err := forwards.Attach(sess); err != nil {
		// Only a repeated registration fails, which is a bug, not a user error.
		forwards.Close()
	}
}

func (server *Server) forwardState() forward.State {
	server.mu.Lock()
	current := server.activeLocked()
	server.mu.Unlock()

	return server.roomForwardState(current)
}

func (server *Server) roomForwardState(current *room) forward.State {
	server.mu.Lock()
	var forwards *forward.Forwards
	if current != nil && server.rooms[current.code] == current {
		forwards = current.forwards
	}
	server.mu.Unlock()

	if forwards == nil {
		return forward.State{Mine: []forward.Item{}, Others: []forward.Item{}, Unsupported: []string{}}
	}

	return forwards.State()
}

// currentForwards returns the request's room's forwards, or a conflict when there is no room.
func (server *Server) currentForwards(c fiber.Ctx) (*forward.Forwards, error) {
	current, err := server.roomFor(c)
	if err != nil {
		return nil, err
	}

	server.mu.Lock()
	defer server.mu.Unlock()

	if current == nil {
		return nil, errNotConnected()
	}

	if current.forwards == nil {
		return nil, errNotConnected()
	}

	return current.forwards, nil
}

func (server *Server) listForwards(c fiber.Ctx) error {
	current, err := server.roomFor(c)
	if err != nil {
		return err
	}

	return c.JSON(server.roomForwardState(current))
}

func (server *Server) shareForward(c fiber.Ctx) error {
	var in struct {
		Port  int    `json:"port"`
		Label string `json:"label"`
	}
	if err := json.Unmarshal(c.Body(), &in); err != nil {
		return apperr.BadRequest("The request could not be understood.")
	}

	forwards, err := server.currentForwards(c)
	if err != nil {
		return err
	}

	item, err := forwards.Share(in.Port, in.Label)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(item)
}

func (server *Server) stopForward(c fiber.Ctx) error {
	forwards, err := server.currentForwards(c)
	if err != nil {
		return err
	}
	if err := forwards.Stop(c.Params("id")); err != nil {
		return err
	}

	return c.JSON(forwards.State())
}

func (server *Server) openForward(c fiber.Ctx) error {
	forwards, err := server.currentForwards(c)
	if err != nil {
		return err
	}

	item, err := forwards.Open(c.Params("id"))
	if err != nil {
		return err
	}

	return c.JSON(item)
}

func (server *Server) closeForward(c fiber.Ctx) error {
	forwards, err := server.currentForwards(c)
	if err != nil {
		return err
	}
	if err := forwards.CloseOpen(c.Params("id")); err != nil {
		return err
	}

	return c.JSON(forwards.State())
}
