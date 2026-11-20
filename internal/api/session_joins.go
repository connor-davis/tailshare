package api

import (
	"strconv"

	"github.com/Polyphron-AI/tailshare/internal/platform/apperr"
	"github.com/gofiber/fiber/v3"
)

func (server *Server) allowJoin(c fiber.Ctx) error { return server.decideJoin(c, true) }

func (server *Server) denyJoin(c fiber.Ctx) error { return server.decideJoin(c, false) }

func (server *Server) decideJoin(c fiber.Ctx, allow bool) error {
	text := c.Params("id")
	id, err := strconv.ParseUint(text, 10, 64)
	if err != nil || id == 0 || strconv.FormatUint(id, 10) != text {
		return apperr.BadRequest("That join request is not valid.")
	}
	server.mu.Lock()
	sess := server.sess
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

	server.publishSession()
	return c.JSON(server.sessionState())
}
