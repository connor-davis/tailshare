package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/gofiber/fiber/v3"
)

// pickedFolder checks a folder chosen in the Save dialog. It must be an absolute, clean
// path to a real folder, not a link, and not a file.
func pickedFolder(folder string) error {
	if !filepath.IsAbs(folder) || filepath.Clean(folder) != folder {
		return apperr.BadRequest("Choose a folder to save into.")
	}
	for _, part := range strings.FieldsFunc(folder, func(r rune) bool { return r == '/' || r == 0x5c }) {
		if part == ".." {
			return apperr.BadRequest("Choose a folder to save into.")
		}
	}

	info, err := os.Lstat(folder)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return apperr.BadRequest("Choose a folder to save into.")
	}

	return nil
}

// saveTransfer starts a download into a folder the person just picked in the Save dialog.
// Only the main process may call it, because the renderer never sends folder paths.
func (server *Server) saveTransfer(c fiber.Ctx) error {
	transfers, err := server.currentTransfers()
	if err != nil {
		return err
	}

	var in struct {
		Source string `json:"source"`
		Folder string `json:"folder"`
		Name   string `json:"name"`
	}
	if json.Unmarshal(c.Body(), &in) != nil || in.Source == "" || in.Name == "" {
		return apperr.BadRequest("Say which file to save and where.")
	}
	if strings.ContainsAny(in.Name, "/\\") {
		return share.ErrBadPath
	}
	if err := pickedFolder(in.Folder); err != nil {
		return err
	}

	root, err := share.Open(in.Folder)
	if err != nil {
		return apperr.BadRequest("Could not open that folder.")
	}

	server.mu.Lock()
	defer server.mu.Unlock()

	if server.ctx.Err() != nil {
		_ = root.Close()
		return errNotConnected()
	}

	for _, existing := range server.downloadRoots {
		if existing.SameFolder(in.Folder) {
			_ = root.Close()
			root = existing
			break
		}
	}
	known := false
	for _, existing := range server.downloadRoots {
		known = known || existing == root
	}
	if !known {
		server.downloadRoots = append(server.downloadRoots, root)
	}

	// Enqueue under the lock, so the root cannot be pruned before the job pins it.
	item, err := transfers.EnqueueInto(server.ctx, TransferRequest{
		Direction: DirectionDownload, Source: in.Source, Destination: in.Name,
	}, root)
	server.pruneDownloadRootsLocked()
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusAccepted).JSON(item)
}
