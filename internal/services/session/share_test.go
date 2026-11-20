package session

import (
	"context"
	"testing"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/services/peer"
)

func TestThreeMembersFullMesh(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	second := connectJoiner(t, host, code, options)
	third := connectJoiner(t, host, code, options)
	for _, session := range []*Session{host, second, third} {
		if len(session.Members()) != 3 {
			t.Fatal("missing full mesh roster")
		}
	}
	for _, pair := range [][2]*Session{{second, host}, {third, host}, {third, second}} {
		outgoing, incoming := dataPair(t, pair[0], pair[1])
		exchange(t, outgoing, incoming, "forward")
		exchange(t, incoming, outgoing, "backward")
	}
}

func TestDenyClosesJoiner(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	results := startMember(t, t.Context(), code, options)
	pending := waitPending(t, host)
	if pending.DisplayName != options.name {
		t.Fatal("prompt lost the hello name")
	}
	if err := host.Deny(pending.ID); err != nil {
		t.Fatal(err)
	}
	assertRemoteCode(t, receiveJoin(t, results).err, peer.CodeJoinDenied)
	if _, ok := host.Pending(); ok || len(host.Members()) != 1 {
		t.Fatal("deny changed membership")
	}
}

func TestPendingJoinTimesOut(t *testing.T) {
	options := localSettings(t)
	options.allowWindow = 300 * time.Millisecond
	host, code := startHost(t, options)
	results := startMember(t, t.Context(), code, options)
	waitPending(t, host)
	assertRemoteCode(t, receiveJoin(t, results).err, peer.CodeJoinDenied)
	if _, ok := host.Pending(); ok {
		t.Fatal("timed-out prompt remains")
	}
}

func TestSecondJoinerRejected(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	first := startMember(t, t.Context(), code, options)
	pending := waitPending(t, host)
	assertRemoteCode(t, receiveJoin(t, startMember(t, t.Context(), code, options)).err, peer.CodeBusy)
	if err := host.Allow(pending.ID); err != nil {
		t.Fatal(err)
	}
	if result := receiveJoin(t, first); result.err != nil {
		t.Fatal(result.err)
	}
}

func TestJoinerGivesUpClearsPending(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	ctx, cancel := context.WithCancel(t.Context())
	results := startMember(t, ctx, code, options)
	waitPending(t, host)
	cancel()
	if result := receiveJoin(t, results); result.err == nil {
		t.Fatal("canceled join succeeded")
	}
	waitState(t, host, func() bool { _, ok := host.Pending(); return !ok })
}

func TestAllowUnknownPendingRefused(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	if host.Allow(1) == nil || host.Deny(1) == nil {
		t.Fatal("missing prompt accepted")
	}
	results := startMember(t, t.Context(), code, options)
	pending := waitPending(t, host)
	if host.Allow(pending.ID+1) == nil {
		t.Fatal("wrong prompt accepted")
	}
	if err := host.Allow(pending.ID); err != nil {
		t.Fatal(err)
	}
	if host.Allow(pending.ID) == nil {
		t.Fatal("repeat Allow accepted")
	}
	if result := receiveJoin(t, results); result.err != nil {
		t.Fatal(result.err)
	}
}

func TestCompetingJoiners(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	ctx, cancel := context.WithTimeout(t.Context(), 40*time.Second)
	defer cancel()
	first := startMember(t, ctx, code, options)
	second := startMember(t, ctx, code, options)
	pending := waitPending(t, host)
	select {
	case result := <-first:
		assertRemoteCode(t, result.err, peer.CodeBusy)
	case result := <-second:
		assertRemoteCode(t, result.err, peer.CodeBusy)
	case <-ctx.Done():
		t.Fatal("neither competing join was refused")
	}
	if len(host.Members()) != 1 {
		t.Fatal("admitted without Allow")
	}
	_ = host.Deny(pending.ID)
}

func TestEightMemberCap(t *testing.T) {
	if testing.Short() {
		t.Skip("real eight-member mesh")
	}
	options := localSettings(t)
	host, code := startHost(t, options)
	members := []*Session{host}
	for range 7 {
		members = append(members, connectJoiner(t, host, code, options))
	}
	for _, session := range members {
		if len(session.Members()) != 8 {
			t.Fatal("incomplete eight-member mesh")
		}
	}
	assertRemoteCode(t, receiveJoin(t, startMember(t, t.Context(), code, options)).err, peer.CodeShareFull)
	if _, ok := host.Pending(); ok {
		t.Fatal("full mesh prompted")
	}
}
