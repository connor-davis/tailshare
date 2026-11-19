package api

import (
	"encoding/json"
	"path/filepath"
	"strconv"

	"github.com/Polyphron-AI/tailshare/internal/platform/apperr"
	"github.com/Polyphron-AI/tailshare/internal/services/share"
	"github.com/gofiber/fiber/v3"
)

const defaultPage = 100

// FolderInfo is the shared folder as the screen sees it: its base name only.
type FolderInfo struct {
	Name string `json:"name"`
}

func (server *Server) folderInfo() *FolderInfo {
	server.mu.Lock()
	defer server.mu.Unlock()

	if server.root == nil {
		return nil
	}

	return &FolderInfo{Name: server.root.Name()}
}

// putFolder opens the folder the native picker chose. The old folder is only
// closed once the new one opened, and not at all while a session uses it.
func (server *Server) putFolder(c fiber.Ctx) error {
	var in struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(c.Body(), &in); err != nil || !filepath.IsAbs(in.Path) {
		return apperr.BadRequest("Choose a folder to share.")
	}

	root, err := share.Open(in.Path)
	if err != nil {
		return apperr.BadRequest(err.Error())
	}

	server.mu.Lock()
	if server.phase != phaseIdle {
		server.mu.Unlock()
		_ = root.Close()

		return apperr.Conflict("conflict", "Leave the session before changing the shared folder.")
	}

	old := server.root
	server.root = root
	server.mu.Unlock()

	if old != nil {
		_ = old.Close()
	}

	return c.JSON(FolderInfo{Name: root.Name()})
}

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

	server.mu.Lock()
	root := server.root
	server.mu.Unlock()

	if root == nil {
		return errNoFolder()
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

	other, err := server.connectedPeer()
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
