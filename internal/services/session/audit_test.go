package session

import (
	"context"
	"io"
	"net"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
)

func TestAuditJoinStreamsBounded(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	var extra net.Conn
	for i := 0; i < 20; i++ {
		conn, _ := admissionConn(t, code, options)
		if i == 19 {
			extra = conn
		}
	}
	_ = extra.SetReadDeadline(time.Now().Add(time.Second))
	if _, err := extra.Read(make([]byte, 1)); err != io.EOF {
		t.Fatalf("excess join not closed: %v", err)
	}
	host.mu.Lock()
	held := len(host.bootstraps)
	host.mu.Unlock()
	if held > 4 {
		t.Fatalf("held %d join streams", held)
	}
}

func TestAuditDenyBackoffAndFingerprint(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	candidate, err := newSession(t.Context(), options, code)
	if err != nil {
		t.Fatal(err)
	}
	defer candidate.Close()
	control := admissionControl(t, host, code, options, candidate.mesh.Self().Address)
	pending := waitPending(t, host)
	host.mu.Lock()
	requester := host.gate.requester
	host.mu.Unlock()
	if pending.Fingerprint != peer.Fingerprint(requester) {
		t.Fatal("prompt lacks authenticated fingerprint")
	}
	if err := host.Deny(pending.ID); err != nil {
		t.Fatal(err)
	}
	_ = control.Close()
	conn, private := admissionConn(t, code, options)
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	if err := writeJoinLine(ctx, conn, private.Public(), candidate.mesh.Self().Address); err != nil {
		t.Fatal(err)
	}
	retry, err := peer.Start(ctx, conn, peer.Options{DisplayName: "Joiner"})
	if err != nil {
		t.Fatal(err)
	}
	defer retry.Close()
	assertRemoteCode(t, retry.Call(ctx, peer.MethodShareRoster, nil, nil), peer.CodeBusy)
	if _, ok := host.Pending(); ok {
		t.Fatal("denied identity prompted again")
	}
}

func TestAuditAllowedUnlinkedCodeStillExpires(t *testing.T) {
	options := localSettings(t)
	options.expiry = time.Second
	host, code := startHost(t, options)
	candidate, err := newSession(t.Context(), options, code)
	if err != nil {
		t.Fatal(err)
	}
	defer candidate.Close()
	control := admissionControl(t, host, code, options, candidate.mesh.Self().Address)
	defer control.Close()
	if err := host.Allow(waitPending(t, host).ID); err != nil {
		t.Fatal(err)
	}
	select {
	case <-host.Done():
	case <-time.After(2 * time.Second):
		t.Fatal("unlinked Allow disabled expiry")
	}
}

func TestAuditRemoveMemberAuthority(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	second := connectJoiner(t, host, code, options)
	third := connectJoiner(t, host, code, options)
	if err := second.RemoveMember(third.SelfID()); err == nil {
		t.Fatal("non-admitter removed member")
	}
	if err := host.RemoveMember(host.SelfID()); err == nil {
		t.Fatal("removed self")
	}
	if err := host.RemoveMember(third.SelfID()); err != nil {
		t.Fatal(err)
	}
	if len(host.Members()) != 2 {
		t.Fatal("member retained")
	}
	if _, ok := host.Control(third.SelfID()); ok {
		t.Fatal("removed control retained")
	}
}
