package api

import (
	"strconv"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/gofiber/fiber/v3"
)

const defaultPage = 100

// page reads path, offset and limit from the query. Limit defaults to 100
// and is clamped to what a folder listing may hold.
func page(c fiber.Ctx) (dir string, offset, limit int, err error) {
	dir = c.Query("path")
	offset, limit = 0, defaultPage

	if raw := c.Query("offset"); raw != "" {
		if offset, err = strconv.Atoi(raw); err != nil || offset < 0 {
			return "", 0, 0, apperr.BadRequest("The offset must be a number that is not negative.")
		}
	}
	if raw := c.Query("limit"); raw != "" {
		if limit, err = strconv.Atoi(raw); err != nil || limit < 0 {
			return "", 0, 0, apperr.BadRequest("The limit must be a number that is not negative.")
		}
	}

	return dir, offset, min(limit, share.MaxPage), nil
}

func (server *Server) localFiles(c fiber.Ctx) error {
	dir, offset, limit, err := page(c)
	if err != nil {
		return err
	}

	current, err := server.roomFor(c)
	if err != nil {
		return err
	}
	if current == nil {
		return errNotConnected()
	}

	server.mu.Lock()
	root := current.root
	server.mu.Unlock()

	if root == nil {
		return errNotConnected()
	}

	entries, total, err := root.List(dir, offset, limit)
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"entries": entries, "total": total})
}

func (server *Server) peerFiles(c fiber.Ctx) error {
	dir, offset, limit, err := page(c)
	if err != nil {
		return err
	}

	other, err := server.connectedPeer(c)
	if err != nil {
		return err
	}

	ctx, cancel := server.contextWithin(callTimeout)
	defer cancel()

	result, err := other.List(ctx, dir, offset, limit)
	if err != nil {
		return err
	}

	return c.JSON(result)
}
