package api

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/gofiber/fiber/v3"
)

func (server *Server) mainOnly(c fiber.Ctx) error {
	values := c.Request().Header.PeekAll("X-Tailshare-Main")
	if server.cfg.MainToken == "" || len(values) != 1 ||
		!tokenMatches(string(values[0]), server.cfg.MainToken) {
		return apperr.Forbidden()
	}
	return c.Next()
}

func (server *Server) addRoomFiles(c fiber.Ctx) error {
	var in struct {
		Paths    []string `json:"paths"`
		RoomCode string   `json:"roomCode"`
	}

	if json.Unmarshal(c.Body(), &in) != nil || len(in.Paths) > 100 {
		return apperr.BadRequest("Choose at most 100 files at a time.")
	}

	// Leave waits for imports, while live state and transfer requests can continue.
	server.roomIO.RLock()
	defer server.roomIO.RUnlock()

	server.mu.Lock()
	current := server.activeLocked()
	if current == nil {
		server.mu.Unlock()
		return errNotConnected()
	}

	root, phase := current.root, current.phase
	server.mu.Unlock()

	if root == nil || (phase != phaseHosting && phase != phaseConnected) {
		return errNotConnected()
	}

	if in.RoomCode != "" {
		code, err := codes.Parse(in.RoomCode)
		if err != nil || root.Name() != code.String() {
			return errNotConnected()
		}
	}

	added := make([]share.AddedFile, 0, len(in.Paths))
	skipped := make([]fiber.Map, 0)
	for _, source := range in.Paths {
		var file share.AddedFile

		var err error
		if info, statErr := os.Lstat(source); statErr == nil && info.IsDir() {
			file, err = root.ImportTree(source)
		} else {
			file, err = root.Import(source)
		}

		if err != nil {
			name := filepath.Base(source)
			if _, bad := share.Localize(name); bad != nil || name == "." {
				name = "File"
			}

			skipped = append(skipped, fiber.Map{"name": name, "reason": "Choose a readable file or folder without links, with at most 10,000 files and 32 levels."})
			continue
		}

		added = append(added, file)
	}

	// One notice for the whole request, after every file is in.
	if len(added) > 0 {
		server.announceRoomChanged(current)
	}

	return c.JSON(fiber.Map{"added": added, "skipped": skipped})
}

func (server *Server) putDownloads(c fiber.Ctx) error {
	var in struct {
		Folder string `json:"folder"`
	}
	if json.Unmarshal(c.Body(), &in) != nil || !filepath.IsAbs(in.Folder) {
		return apperr.BadRequest("Choose a downloads folder.")
	}
	// The default Downloads/Tailshare folder may not exist on a fresh install.
	if err := os.MkdirAll(in.Folder, 0o700); err != nil {
		return apperr.BadRequest("Could not create the downloads folder.")
	}
	server.mu.Lock()
	for _, existing := range server.downloadRoots {
		if existing.SameFolder(in.Folder) {
			server.downloadRoot = existing
			for _, current := range server.rooms {
				if current.manager != nil {
					current.manager.SetDownloadRoot(existing)
				}
			}
			server.pruneDownloadRootsLocked()
			server.mu.Unlock()
			return c.JSON(fiber.Map{"ok": true})
		}
	}
	server.mu.Unlock()
	root, err := share.Open(in.Folder)
	if err != nil {
		return apperr.BadRequest("Could not open the downloads folder.")
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
	// Resumable jobs pin old roots until their manager is released.
	known := false
	for _, existing := range server.downloadRoots {
		if existing == root {
			known = true
		}
	}
	if !known {
		server.downloadRoots = append(server.downloadRoots, root)
	}
	server.downloadRoot = root
	for _, current := range server.rooms {
		if current.manager != nil {
			current.manager.SetDownloadRoot(root)
		}
	}
	server.pruneDownloadRootsLocked()
	return c.JSON(fiber.Map{"ok": true})
}

func (server *Server) pruneDownloadRootsLocked() {
	roots := server.downloadRoots[:0]
	for _, root := range server.downloadRoots {
		pinned := root == server.downloadRoot
		for _, current := range server.rooms {
			if current.manager != nil && current.manager.PinsRoot(root) {
				pinned = true
				break
			}
		}
		if pinned {
			roots = append(roots, root)
		} else {
			_ = root.Close()
		}
	}
	server.downloadRoots = roots
}
