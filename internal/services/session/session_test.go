package session

import (
	"context"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

func TestMain(tests *testing.M) { tailcattest.Init(); os.Exit(tests.Run()) }

func localSettings(t *testing.T) settings {
	t.Helper()
	relay := tailcattest.LocalDERP(t)
	return settings{
		regionID: tailcattest.RegionID, region: relay.Regions[tailcattest.RegionID], derpMap: relay,
		expiry: 10 * time.Minute, name: "Member", allowWindow: time.Minute, lostGrace: 300 * time.Millisecond,
	}
}

func startHost(t *testing.T, options settings) (*Session, codes.Code) {
	t.Helper()
	session, code, err := host(t.Context(), options)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return session, code
}

type joinResult struct {
	session *Session
	err     error
}

func startMember(t *testing.T, ctx context.Context, code codes.Code, options settings) <-chan joinResult {
	t.Helper()
	results := make(chan joinResult, 1)
	go func() {
		session, err := join(ctx, code.String(), options)
		results <- joinResult{session, err}
	}()
	return results
}

func receiveJoin(t *testing.T, results <-chan joinResult) joinResult {
	t.Helper()
	select {
	case result := <-results:
		if result.session != nil {
			t.Cleanup(func() { _ = result.session.Close() })
		}
		return result
	case <-time.After(45 * time.Second):
		t.Fatal("join did not finish")
		return joinResult{}
	}
}

func waitState(t *testing.T, session *Session, predicate func() bool) {
	t.Helper()
	_, caller, line, _ := runtime.Caller(1)
	deadline := time.NewTimer(40 * time.Second)
	defer deadline.Stop()
	for !predicate() {
		select {
		case <-session.Changes():
		case <-session.Done():
			if !predicate() {
				t.Fatal("session closed before expected state")
			}
		case <-deadline.C:
			t.Fatalf("state did not arrive at %s:%d; members=%+v", caller, line, session.Members())
		}
	}
}

func waitPending(t *testing.T, session *Session) PendingJoin {
	t.Helper()
	var pending PendingJoin
	waitState(t, session, func() bool { var ok bool; pending, ok = session.Pending(); return ok })
	return pending
}

func connectJoiner(t *testing.T, host *Session, code codes.Code, options settings) *Session {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 40*time.Second)
	defer cancel()
	results := startMember(t, ctx, code, options)
	pending := waitPending(t, host)
	if err := host.Allow(pending.ID); err != nil {
		t.Fatal(err)
	}
	result := receiveJoin(t, results)
	if result.err != nil {
		t.Fatal(result.err)
	}
	id := result.session.mesh.Self().ID
	waitState(t, host, func() bool { _, ok := host.Control(id); return ok })
	waitState(t, host, func() bool {
		host.mu.Lock()
		defer host.mu.Unlock()
		return host.gate == nil
	})
	return result.session
}

func dataPair(t *testing.T, dialer, acceptor *Session) (net.Conn, net.Conn) {
	t.Helper()
	outgoingTunnel, ok := dialer.Tunnel(acceptor.mesh.Self().ID)
	if !ok {
		t.Fatal("outgoing tunnel missing")
	}
	incomingTunnel, ok := acceptor.Tunnel(dialer.mesh.Self().ID)
	if !ok {
		t.Fatal("incoming tunnel missing")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	outgoing, err := outgoingTunnel.Open(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = outgoing.Close() })
	accepted := make(chan net.Conn, 1)
	go func() { conn, _ := incomingTunnel.Accept(); accepted <- conn }()
	select {
	case incoming := <-accepted:
		if incoming == nil {
			t.Fatal("incoming tunnel closed")
		}
		t.Cleanup(func() { _ = incoming.Close() })
		return outgoing, incoming
	case <-ctx.Done():
		t.Fatal("data stream did not arrive")
		return nil, nil
	}
}

func TestAllowLinksTwoMembers(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	joiner := connectJoiner(t, host, code, options)
	if len(host.Members()) != 2 || len(joiner.Members()) != 2 {
		t.Fatal("missing members")
	}
	for range 2 {
		outgoing, incoming := dataPair(t, joiner, host)
		exchange(t, outgoing, incoming, "hello host")
		exchange(t, incoming, outgoing, "hello joiner")
	}
}

func TestJoinTwoRoomsConcurrentlyWithSameIdentity(t *testing.T) {
	options := localSettings(t)
	private, _ := newIdentity()
	identity, err := private.MarshalText()
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Identity: string(identity)}
	joinOptions := options
	joinOptions.identity, err = cfg.IdentityKey()
	if err != nil {
		t.Fatal(err)
	}

	rooms := []struct {
		file    string
		host    *Session
		code    codes.Code
		results <-chan joinResult
		joiner  *Session
	}{
		{file: "room-a.txt"},
		{file: "room-b.txt"},
	}
	for index := range rooms {
		room := &rooms[index]
		folder := t.TempDir()
		if err := os.WriteFile(filepath.Join(folder, room.file), []byte(room.file), 0o600); err != nil {
			t.Fatal(err)
		}

		root, err := share.Open(folder)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = root.Close() })
		hostOptions := options
		hostOptions.options.Root = root
		room.host, room.code = startHost(t, hostOptions)
	}
	if rooms[0].code == rooms[1].code {
		t.Fatal("hosts generated the same room code")
	}

	// Both bootstrap clients use the app's saved key on the same relay at once.
	ctx, cancel := context.WithTimeout(t.Context(), 40*time.Second)
	defer cancel()
	for index := range rooms {
		room := &rooms[index]
		room.results = startMember(t, ctx, room.code, joinOptions)
	}
	for _, room := range rooms {
		pending := waitPending(t, room.host)
		public, _, err := room.host.PendingKey(pending.ID)
		if err != nil || public != private.Public().String() {
			t.Fatalf("room %s identity = %q, error = %v", room.code, public, err)
		}

		if err := room.host.Allow(pending.ID); err != nil {
			t.Fatal(err)
		}
	}
	for index := range rooms {
		room := &rooms[index]
		result := receiveJoin(t, room.results)
		if result.err != nil {
			t.Fatalf("join room %s: %v", room.code, result.err)
		}
		room.joiner = result.session
		waitState(t, room.host, func() bool {
			_, ok := room.host.Control(room.joiner.SelfID())
			return ok
		})
	}

	// Repeat the calls with both rooms open, so a later join cannot replace the first.
	for range 2 {
		for _, room := range rooms {
			if len(room.host.Members()) != 2 || len(room.joiner.Members()) != 2 {
				t.Fatalf("room %s lost a member while both rooms were open", room.code)
			}
			control, ok := room.joiner.Control(room.host.SelfID())
			if !ok {
				t.Fatalf("room %s lost its host control", room.code)
			}

			listing, err := control.List(ctx, "", 0, 0)
			if err != nil {
				t.Fatalf("list room %s: %v", room.code, err)
			}
			if listing.Total != 1 || len(listing.Entries) != 1 || listing.Entries[0].Name != room.file {
				t.Fatalf("room %s listing = %+v, want only %s", room.code, listing, room.file)
			}
		}
	}
}

func exchange(t *testing.T, sender, receiver net.Conn, message string) {
	t.Helper()
	_ = sender.SetDeadline(time.Now().Add(5 * time.Second))
	_ = receiver.SetDeadline(time.Now().Add(5 * time.Second))
	written := make(chan error, 1)
	go func() {
		_, err := io.WriteString(sender, message)
		written <- err
	}()

	buffer := make([]byte, len(message))
	if _, err := io.ReadFull(receiver, buffer); err != nil {
		t.Fatal(err)
	}
	if string(buffer) != message {
		t.Fatalf("received %q, want %q", buffer, message)
	}
	if err := <-written; err != nil {
		t.Fatal(err)
	}
}

func TestJoinBadCode(t *testing.T) {
	if _, err := Join(t.Context(), "nope", config.Config{}, "Name", Options{}); !errors.Is(err, codes.ErrInvalid) {
		t.Fatalf("Join invalid code: %v", err)
	}
}

func TestCodeExpires(t *testing.T) {
	options := localSettings(t)
	options.expiry = 100 * time.Millisecond
	host, code := startHost(t, options)
	select {
	case <-host.Done():
	case <-time.After(3 * time.Second):
		t.Fatal("unused code did not expire")
	}
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	result := receiveJoin(t, startMember(t, ctx, code, options))
	if result.err == nil {
		t.Fatal("expired code admitted a joiner")
	}
}

func TestHostContextClosesSession(t *testing.T) {
	options := localSettings(t)
	ctx, cancel := context.WithCancel(t.Context())
	host, _, err := host(ctx, options)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	defer host.Close()
	cancel()
	select {
	case <-host.Done():
	case <-time.After(3 * time.Second):
		t.Fatal("host context did not close session")
	}
}

func assertRemoteCode(t *testing.T, err error, code string) {
	t.Helper()
	var remote *peer.RemoteError
	if !errors.As(err, &remote) || remote.Code != code {
		t.Fatalf("error=%v, want %s", err, code)
	}
}

func TestExpiresAtLastsUntilJoinOrClose(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	expires, ok := host.ExpiresAt()
	if !ok || time.Until(expires) < 9*time.Minute || time.Until(expires) > 10*time.Minute {
		t.Fatalf("expiry %v %v", expires, ok)
	}

	connectJoiner(t, host, code, options)
	if _, ok := host.ExpiresAt(); ok {
		t.Fatal("expiry kept after a join")
	}

	other, _ := startHost(t, localSettings(t))
	_ = other.Close()
	if _, ok := other.ExpiresAt(); ok {
		t.Fatal("expiry kept after close")
	}
}
