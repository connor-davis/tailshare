package session

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"time"

	"github.com/connor-davis/tailshare/internal/services/mesh"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/tailscale/tailcat"
)

type joinGate struct {
	ready     chan struct{}
	decision  chan struct{}
	member    peer.ShareMember
	requester string
	pending   PendingJoin
	decided   bool
	err       error
	admission *mesh.Admission
	timer     *time.Timer
}

func denied() *peer.RemoteError {
	return &peer.RemoteError{Code: peer.CodeJoinDenied, Message: "The host did not let you join."}
}

// Allow approves only the current prompt and starts the bounded preparation slot.
func (session *Session) Allow(id uint64) error {
	session.mu.Lock()
	defer session.mu.Unlock()
	gate := session.gate
	if session.closed || gate == nil || gate.decided || gate.pending.ID != id {
		return errors.New("That join request is no longer waiting.")
	}

	admission, err := session.mesh.BeginAdmission(gate.member)
	gate.admission = admission

	session.decideLocked(gate, err)
	return err
}

// Deny refuses only the current prompt. Stale prompt IDs cannot affect another joiner.
func (session *Session) Deny(id uint64) error {
	session.mu.Lock()
	defer session.mu.Unlock()
	gate := session.gate
	if session.closed || gate == nil || gate.decided || gate.pending.ID != id {
		return errors.New("That join request is no longer waiting.")
	}

	if session.deniedKeys == nil {
		session.deniedKeys = make(map[string]time.Time)
	}
	for key, until := range session.deniedKeys {
		if time.Now().After(until) {
			delete(session.deniedKeys, key)
		}
	}
	session.deniedKeys[gate.member.ID] = time.Now().Add(60 * time.Second)
	session.deniedKeys[gate.requester] = time.Now().Add(60 * time.Second)
	session.decideLocked(gate, denied())
	return nil
}

func (session *Session) decideLocked(gate *joinGate, err error) {
	if gate.decided {
		return
	}

	gate.decided, gate.err = true, err
	if gate.timer != nil {
		gate.timer.Stop()
	}

	close(gate.decision)
	if err != nil && session.gate == gate {
		session.gate = nil
	}
	session.changedLocked()
}

func (session *Session) gateHandler(gate *joinGate, method string) peer.Handler {
	return func(ctx context.Context, raw json.RawMessage) (any, error) {
		select {
		case <-gate.ready:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		select {
		case <-gate.decision:
		case <-ctx.Done():
			return nil, ctx.Err()
		}

		session.mu.Lock()
		admission, err := gate.admission, gate.err
		session.mu.Unlock()
		if err != nil {
			return nil, err
		}
		return admission.Handlers()[method](ctx, raw)
	}
}

func (session *Session) admitStream(server *tailcat.Server, conn net.Conn) {
	defer func() {
		_ = conn.Close()
		session.mu.Lock()
		delete(session.bootstraps, conn)
		session.mu.Unlock()
	}()
	member, err := readJoinLine(session.ctx, server, conn)
	if err != nil {
		return
	}

	public, authenticated := peerKey(server, conn.RemoteAddr())
	if !authenticated {
		return
	}
	gate := &joinGate{
		requester: public.String(), member: member,
		ready: make(chan struct{}), decision: make(chan struct{}),
	}
	handlers := map[string]peer.Handler{
		peer.MethodShareRoster: session.gateHandler(gate, peer.MethodShareRoster),
		peer.MethodShareLinks:  session.gateHandler(gate, peer.MethodShareLinks),
	}
	ctx, cancel := context.WithTimeout(session.ctx, 30*time.Second)
	control, err := peer.Start(ctx, conn, peer.Options{
		DisplayName: session.settings.name, RoomName: session.RoomName(), Handlers: handlers,
	})
	cancel()
	if err != nil {
		return
	}
	defer control.Close()
	gate.member.DisplayName = control.Remote().DisplayName

	session.mu.Lock()
	for key, until := range session.deniedKeys {
		if time.Now().After(until) {
			delete(session.deniedKeys, key)
		}
	}
	switch {
	case session.closed || !session.mesh.IsAdmitter():
		session.decideLocked(gate, &peer.RemoteError{
			Code: peer.CodeNotAdmitter, Message: "This computer cannot admit someone.",
		})
	case len(session.mesh.Roster().Members) >= peer.MaxShareMembers:
		session.decideLocked(gate, &peer.RemoteError{
			Code: peer.CodeShareFull, Message: "This share already has eight people.",
		})
	case session.gate != nil || len(session.deniedKeys) >= 254 ||
		time.Now().Before(session.deniedKeys[member.ID]) ||
		time.Now().Before(session.deniedKeys[gate.requester]):
		session.decideLocked(gate, &peer.RemoteError{
			Code: peer.CodeBusy, Message: "Someone else is joining. Try again shortly.",
		})
	default:
		session.nextJoin++
		gate.pending = PendingJoin{
			ID: session.nextJoin, DisplayName: gate.member.DisplayName,
			Fingerprint: peer.Fingerprint(gate.requester),
		}
		session.gate = gate

		window := session.settings.allowWindow
		if window <= 0 {
			window = allowWindow
		}

		gate.timer = time.AfterFunc(window, func() {
			session.mu.Lock()
			defer session.mu.Unlock()
			session.decideLocked(gate, denied())
		})
		session.changedLocked()
	}
	close(gate.ready)
	refused := gate.decided && gate.err != nil
	session.mu.Unlock()
	if refused {
		timer := time.NewTimer(100 * time.Millisecond)
		defer timer.Stop()
		select {
		case <-control.Done():
		case <-session.done:
		case <-timer.C:
		}
		return
	}

	// A client that never sends another request cannot hold a code stream forever.
	select {
	case <-gate.decision:
	case <-control.Done():
	case <-session.done:
	}
	session.mu.Lock()
	refused = gate.err != nil
	session.mu.Unlock()
	if refused {
		timer := time.NewTimer(100 * time.Millisecond)
		defer timer.Stop()
		select {
		case <-control.Done():
		case <-session.done:
		case <-timer.C:
		}
		return
	}
	backstop := time.NewTimer(mesh.AdmissionTimeout)
	defer backstop.Stop()
	select {
	case <-control.Done():
	case <-session.done:
	case <-backstop.C:
	}

	session.mu.Lock()
	if !gate.decided {
		session.decideLocked(gate, denied())
	}
	admission := gate.admission
	if session.gate == gate {
		session.gate = nil
		session.changedLocked()
	}
	session.mu.Unlock()
	if admission != nil {
		admission.Close()
	}
}
