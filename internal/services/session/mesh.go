package session

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"time"

	"github.com/connor-davis/tailshare/internal/services/mesh"
	"github.com/connor-davis/tailshare/internal/services/peer"
)

func mergeHandlers(first, second map[string]peer.Handler) (map[string]peer.Handler, error) {
	handlers := make(map[string]peer.Handler, len(first)+len(second))
	for method, handler := range first {
		handlers[method] = handler
	}
	for method, handler := range second {
		if _, exists := handlers[method]; exists {
			return nil, errors.New("Share handlers must have different names.")
		}
		handlers[method] = handler
	}
	return handlers, nil
}

func (session *Session) acceptMesh() {
	for {
		id, conn, err := session.mesh.Accept()
		if err != nil {
			return
		}
		go func() { _, _ = session.startControl(session.ctx, id, conn) }()
	}
}

func (session *Session) startControl(ctx context.Context, id string, conn net.Conn) (*peer.Peer, error) {
	session.mu.Lock()
	extra := make(map[string]peer.Handler, len(session.settings.options.Handlers))
	for method := range session.settings.options.Handlers {
		extra[method] = func(ctx context.Context, raw json.RawMessage) (any, error) {
			session.mu.Lock()
			handler := session.settings.options.Handlers[method]
			session.mu.Unlock()
			return handler(ctx, raw)
		}
	}
	session.mu.Unlock()

	handlers, err := mergeHandlers(session.mesh.Handlers(id), extra)
	if err == nil {
		handlers, err = mergeHandlers(handlers, session.streamHandlers(id))
	}
	if err == nil {
		handlers, err = mergeHandlers(handlers, session.settings.options.RoomHandlers)
	}
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	bounded, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	control, err := peer.Start(bounded, conn, peer.Options{
		MemberID: id, DisplayName: session.settings.name, RoomName: session.RoomName(),
		Share: session.settings.options.Root, Handlers: handlers,
	})
	if err != nil {
		return nil, err
	}

	session.mu.Lock()
	if session.closed || session.controls[id] != nil {
		session.mu.Unlock()
		_ = control.Close()
		return nil, net.ErrClosed
	}
	if err := session.mesh.RegisterPeer(id, control); err != nil {
		session.mu.Unlock()
		_ = control.Close()
		return nil, err
	}
	subscription := control.Subscribe()
	session.controls[id] = control
	if session.timer != nil {
		session.timer.Stop()
	}
	session.expiresAt = time.Time{}
	session.changedLocked()
	session.mu.Unlock()
	go session.watchMember(id, control, subscription)
	go session.observePath(id, control)
	if tunnel, ok := session.mesh.Tunnel(id); ok {
		go session.serveStreams(id, tunnel)
	}
	return control, nil
}

func (session *Session) watchMember(id string, control *peer.Peer, subscription *peer.Subscription) {
	defer func() { subscription.Close() }()
	for {
		select {
		case <-session.done:
			return
		case event, open := <-subscription.Events:
			if open {
				if event.Kind == peer.EventShare && event.Method == peer.MethodShareLeave {
					session.dropMember(id, control, true)
					return
				}
				continue
			}
			// Drain buffered leave events before treating the closed peer as a lost link.
			select {
			case <-control.Done():
				session.dropMember(id, control, false)
				return
			default:
				subscription.Close()
				subscription = control.Subscribe()
			}
		}
	}
}

func (session *Session) dropMember(id string, control *peer.Peer, clean bool) {
	session.mu.Lock()
	if session.closed || session.controls[id] != control {
		session.mu.Unlock()
		return
	}
	roster := session.mesh.Roster().Members
	wasAdmitter := len(roster) != 0 && roster[0].ID == id
	present := false
	for _, member := range roster {
		if member.ID == id {
			present = true
		}
	}
	_ = session.mesh.Remove(id)
	delete(session.controls, id)
	delete(session.paths, id)
	remaining := len(session.mesh.Roster().Members)
	takeover := wasAdmitter && session.mesh.IsAdmitter()
	session.changedLocked()
	session.mu.Unlock()
	_ = control.Close()

	if remaining == 1 && present {
		_ = session.Close()
		return
	}
	if takeover {
		delay := session.settings.lostGrace
		if clean {
			delay = 0
		}
		timer := time.NewTimer(delay)
		defer timer.Stop()
		select {
		case <-session.done:
			return
		case <-timer.C:
		}
		if err := session.startCodeServer(); err != nil {
			_ = session.Close()
		}
	}
}

func (session *Session) dialAll(ctx context.Context, links map[string]*mesh.Link) error {
	for _, member := range session.mesh.Roster().Members {
		if member.ID == session.mesh.Self().ID {
			continue
		}
		conn, err := session.mesh.Dial(ctx, member.ID, links[member.ID])
		if err != nil {
			return err
		}
		if _, err := session.startControl(ctx, member.ID, conn); err != nil {
			return err
		}
	}
	return nil
}

// RemoveMember lets only the current admitter remove another member and its links.
func (session *Session) RemoveMember(id string) error {
	session.mu.Lock()
	if session.closed || !session.mesh.IsAdmitter() || id == session.mesh.Self().ID {
		session.mu.Unlock()
		return &peer.RemoteError{Code: peer.CodeNotAdmitter, Message: "Only the first member can remove someone."}
	}
	if err := session.mesh.Remove(id); err != nil {
		session.mu.Unlock()
		return err
	}
	control := session.controls[id]
	delete(session.controls, id)
	delete(session.paths, id)
	session.changedLocked()
	session.mu.Unlock()
	if control != nil {
		_ = control.Close()
	}
	return nil
}

// SetHandlers replaces existing application handlers on current and future controls.
// Method names stay fixed so replacement cannot acquire mesh admission authority.
func (session *Session) SetHandlers(handlers map[string]peer.Handler) error {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed || len(handlers) != len(session.settings.options.Handlers) {
		return net.ErrClosed
	}
	for method, handler := range handlers {
		if handler == nil || session.settings.options.Handlers[method] == nil {
			return errors.New("Only existing application handlers can be replaced.")
		}
	}
	copied, _ := mergeHandlers(nil, handlers)
	session.settings.options.Handlers = copied
	return nil
}
