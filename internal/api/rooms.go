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

// transferLimits are the Settings choices for slots and speed. Zero slots means the default.
type transferLimits struct {
	slots, uploadKiB, downloadKiB int
}

func applyLimits(manager *transfer.Manager, limits transferLimits) {
	if limits.slots > 0 {
		_ = manager.SetSlots(limits.slots)
	}
	_ = manager.SetLimits(limits.uploadKiB, limits.downloadKiB)
}

func (server *Server) roomManager(root *share.Root) (*room, *transfer.Manager, error) {
	server.mu.Lock()
	defer server.mu.Unlock()

	current := server.rooms[root.Name()]
	if current == nil || server.ctx.Err() != nil {
		return current, nil, errNotConnected()
	}

	manager := transfer.New(root)
	manager.SetDownloadRoot(server.downloadRoot)
	manager.OnRoomChanged(func() { server.announceRoomChanged(current) })
	applyLimits(manager, server.limits)
	current.manager = manager
	return current, manager, nil
}

// announceRoomChanged keeps manager callbacks attached to their original room.
func (server *Server) announceRoomChanged(current *room) {
	server.mu.Lock()
	if current == nil || server.rooms[current.code] != current {
		server.mu.Unlock()
		return
	}

	sess := current.sess
	server.mu.Unlock()

	if sess != nil {
		sess.NotifyShareChanged()
	}
}
