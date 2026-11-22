package api

import (
	"testing"

	"github.com/connor-davis/tailshare/internal/services/session"
)

func TestRoomHelpersKeepSessionOwnership(t *testing.T) {
	first := &room{code: "7K3Q-9PXM", sess: &session.Session{}}
	second := &room{code: "8K3Q-9PXM", sess: &session.Session{}}
	server := &Server{rooms: map[string]*room{first.code: first, second.code: second}, active: second.code}

	server.mu.Lock()
	defer server.mu.Unlock()

	if server.activeLocked() != second || server.sessionRoomLocked(first.sess) != first {
		t.Fatal("session ownership followed the active selection")
	}
	if server.sessionRoomLocked(nil) != nil || server.sessionRoomLocked(&session.Session{}) != nil {
		t.Fatal("unknown session matched a room")
	}

	replacement := &room{code: first.code}
	server.rooms[first.code] = replacement
	server.forgetRoomLocked(first)
	if server.rooms[first.code] != replacement || server.activeLocked() != second {
		t.Fatal("stale cleanup removed another reservation")
	}

	server.forgetRoomLocked(second)
	if server.activeLocked() != nil || server.active != "" || len(server.rooms) != 1 {
		t.Fatal("active room cleanup retained the selection or removed another room")
	}
}
