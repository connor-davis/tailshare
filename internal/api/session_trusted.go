package api

import (
	"encoding/json"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/gofiber/fiber/v3"
)

// putTrusted replaces the list of computers that skip Allow. The app keeps the saved list
// and sends all of it again after every start, so the sidecar remembers nothing on disk.
func (server *Server) putTrusted(c fiber.Ctx) error {
	var in struct {
		Keys []string `json:"keys"`
	}
	if json.Unmarshal(c.Body(), &in) != nil {
		return apperr.BadRequest("The request could not be understood.")
	}

	if err := server.trusted.Set(in.Keys); err != nil {
		return apperr.BadRequest(err.Error())
	}

	return c.JSON(fiber.Map{"ok": true})
}

// joinKey tells the app who is behind one waiting prompt, so it can save them as trusted.
// Only the app may ask: the key never reaches the page.
func (server *Server) joinKey(c fiber.Ctx) error {
	id, err := joinID(c)
	if err != nil {
		return err
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

	public, fingerprint, err := sess.PendingKey(id)
	if err != nil {
		return apperr.Conflict("conflict", "That join request is no longer waiting.")
	}

	return c.JSON(fiber.Map{
		"key": public, "fingerprint": fingerprint, "displayName": pending.DisplayName,
	})
}
