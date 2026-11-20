package api

import (
	"os"
	"path/filepath"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/services/transfer"
)

func (server *Server) openRoom(code codes.Code) (*share.Root, error) {
	parsed, err := codes.Parse(string(code))
	if err != nil {
		return nil, apperr.BadRequest("That room code is not valid.")
	}
	if !filepath.IsAbs(server.cfg.RoomsDir) {
		return nil, apperr.BadRequest("The room storage folder is not configured.")
	}
	if err := os.MkdirAll(server.cfg.RoomsDir, 0o700); err != nil {
		return nil, apperr.BadRequest("Could not create the room storage folder.")
	}
	return share.OpenRoom(server.cfg.RoomsDir, parsed.String())
}

func (server *Server) roomManager(root *share.Root) *transfer.Manager {
	server.mu.Lock()
	defer server.mu.Unlock()

	manager := transfer.New(root)
	manager.SetDownloadRoot(server.downloadRoot)
	server.manager = manager
	return manager
}
