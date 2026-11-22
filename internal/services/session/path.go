package session

import (
	"context"
	"time"

	"github.com/connor-davis/tailshare/internal/services/mesh"
	"github.com/connor-davis/tailshare/internal/services/peer"
)

// Path returns the last observation for a member, or nil before its first probe.
func (session *Session) Path(id string) *mesh.Path {
	session.mu.Lock()
	defer session.mu.Unlock()
	if path, ok := session.paths[id]; ok && !session.closed {
		return &path
	}
	return nil
}

func (session *Session) observePath(id string, control *peer.Peer) {
	ctx, cancel := context.WithCancel(session.ctx)
	defer cancel()
	go func() {
		select {
		case <-control.Done():
			cancel()
		case <-ctx.Done():
		}
	}()
	timer := time.NewTicker(30 * time.Second)
	defer timer.Stop()
	for {
		probe, finish := context.WithTimeout(ctx, 5*time.Second)
		path := session.mesh.Path(probe, id)
		finish()
		session.mu.Lock()
		if session.closed || session.controls[id] != control {
			session.mu.Unlock()
			return
		}
		if previous, ok := session.paths[id]; !ok || previous != path {
			session.paths[id] = path
			session.changedLocked()
		}
		session.mu.Unlock()
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
	}
}
