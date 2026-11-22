package api

import (
	"strconv"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/gofiber/fiber/v3"
)

func (server *Server) allowJoin(c fiber.Ctx) error { return server.decideJoin(c, true) }

func (server *Server) denyJoin(c fiber.Ctx) error { return server.decideJoin(c, false) }

// joinID reads the prompt ID from the URL. It must be a plain positive number.
func joinID(c fiber.Ctx) (uint64, error) {
	text := c.Params("id")
	id, err := strconv.ParseUint(text, 10, 64)
	if err != nil || id == 0 || strconv.FormatUint(id, 10) != text {
		return 0, apperr.BadRequest("That join request is not valid.")
	}

	return id, nil
}

func (server *Server) decideJoin(c fiber.Ctx, allow bool) error {
	id, err := joinID(c)
	if err != nil {
		return err
	}
	current, err := server.roomFor(c)
	if err != nil {
		return err
	}
	if current == nil {
		return apperr.Conflict("conflict", "Nobody is waiting to join.")
	}

	server.mu.Lock()
	sess := current.sess
	server.mu.Unlock()
	if sess == nil {
		return apperr.Conflict("conflict", "Nobody is waiting to join.")
	}
	pending, ok := sess.Pending()
	if !ok {
		return apperr.Conflict("conflict", "Nobody is waiting to join.")
	}
	if pending.ID != id {
		return apperr.NotFound("That join request was not found.")
	}
	if allow {
		err = sess.Allow(id)
	} else {
		err = sess.Deny(id)
	}
	if err != nil {
		return apperr.Conflict("conflict", "That join request is no longer waiting.")
	}

	server.publishSession(current)
	return c.JSON(server.sessionState())
}
