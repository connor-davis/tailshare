package api

import (
	"encoding/json"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/forward"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/gofiber/fiber/v3"
)

// newForwards makes the room's port forwards. Their changes go to the live socket.
func (server *Server) newForwards() *forward.Forwards {
	return forward.New(func() { server.hub.publish("forward.changed", server.forwardState()) })
}

// attachForwards starts the forwards on a new session and keeps them for its lifetime.
func (server *Server) attachForwards(sess *session.Session, forwards *forward.Forwards) {
	server.mu.Lock()
	server.forwards = forwards
	server.mu.Unlock()

	if err := forwards.Attach(sess); err != nil {
		// Only a repeated registration fails, which is a bug, not a user error.
		forwards.Close()
	}
}

// syncRoomFeatures follows room membership for apps.
func (server *Server) syncRoomFeatures() {
	server.mu.Lock()
	forwards := server.forwards
	server.mu.Unlock()

	if forwards != nil {
		forwards.Sync()
	}
}

func (server *Server) forwardState() forward.State {
	server.mu.Lock()
	forwards := server.forwards
	server.mu.Unlock()

	if forwards == nil {
		return forward.State{Mine: []forward.Item{}, Others: []forward.Item{}, Unsupported: []string{}}
	}

	return forwards.State()
}

// currentForwards returns the room's forwards, or a conflict when there is no room.
func (server *Server) currentForwards() (*forward.Forwards, error) {
	server.mu.Lock()
	defer server.mu.Unlock()

	if server.forwards == nil {
		return nil, errNotConnected()
	}

	return server.forwards, nil
}

func (server *Server) listForwards(c fiber.Ctx) error {
	return c.JSON(server.forwardState())
}

func (server *Server) shareForward(c fiber.Ctx) error {
	var in struct {
		Port  int    `json:"port"`
		Label string `json:"label"`
	}
	if err := json.Unmarshal(c.Body(), &in); err != nil {
		return apperr.BadRequest("The request could not be understood.")
	}

	forwards, err := server.currentForwards()
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
	forwards, err := server.currentForwards()
	if err != nil {
		return err
	}
	if err := forwards.Stop(c.Params("id")); err != nil {
		return err
	}

	return c.JSON(forwards.State())
}

func (server *Server) openForward(c fiber.Ctx) error {
	forwards, err := server.currentForwards()
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
	forwards, err := server.currentForwards()
	if err != nil {
		return err
	}
	if err := forwards.CloseOpen(c.Params("id")); err != nil {
		return err
	}

	return c.JSON(forwards.State())
}
