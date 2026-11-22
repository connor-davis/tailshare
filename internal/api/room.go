package api

import (
	"github.com/connor-davis/tailshare/internal/services/forward"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/services/transfer"
)

// room keeps one session's state together. Server.mu guards its fields and membership.
type room struct {
	phase        string
	role         string
	code         string
	roomName     string
	sess         *session.Session
	peer         *peer.Peer
	root         *share.Root
	manager      *transfer.Manager
	transfers    Transfers
	transferDone chan struct{}
	ending       chan struct{}
	forwards     *forward.Forwards
}

// activeLocked returns nil when no room is selected. The caller holds Server.mu.
func (server *Server) activeLocked() *room {
	return server.rooms[server.active]
}

// sessionRoomLocked finds the owning room even when another room is selected.
func (server *Server) sessionRoomLocked(sess *session.Session) *room {
	if sess == nil {
		return nil
	}

	for _, current := range server.rooms {
		if current.sess == sess {
			return current
		}
	}
	return nil
}

// forgetRoomLocked removes only this reservation, so stale work cannot remove its replacement.
func (server *Server) forgetRoomLocked(current *room) {
	if server.rooms[current.code] != current {
		return
	}

	delete(server.rooms, current.code)
	if server.active == current.code {
		server.active = ""
	}
}
