package peer

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/services/share"
	"github.com/Polyphron-AI/tailshare/internal/testsupport/tailcattest"
)

func TestMain(m *testing.M) {
	tailcattest.Init()

	os.Exit(m.Run())
}

func testContext(t *testing.T) context.Context {
	t.Helper()

	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	t.Cleanup(cancel)

	return ctx
}

// sharedFolder makes a folder holding the given files and opens it.
func sharedFolder(t *testing.T, files map[string]string) *share.Root {
	t.Helper()

	dir := t.TempDir()
	for name, text := range files {
		path := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	root, err := share.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })

	return root
}

// startPair joins two peers over an in-memory stream.
func startPair(t *testing.T, left, right Options) (*Peer, *Peer) {
	t.Helper()

	return startOver(t, testContext(t), left, right)
}

func startOver(t *testing.T, ctx context.Context, left, right Options) (*Peer, *Peer) {
	t.Helper()

	leftConn, rightConn := net.Pipe()
	var started sync.WaitGroup
	var rightPeer *Peer
	var rightErr error

	started.Go(func() { rightPeer, rightErr = Start(ctx, rightConn, right) })

	leftPeer, err := Start(ctx, leftConn, left)
	started.Wait()

	if err != nil || rightErr != nil {
		t.Fatalf("start: %v / %v", err, rightErr)
	}
	t.Cleanup(func() { _ = leftPeer.Close(); _ = rightPeer.Close() })

	return leftPeer, rightPeer
}

func TestHello(t *testing.T) {
	left := sharedFolder(t, nil)
	alice, bob := startPair(t,
		Options{DisplayName: "Alice", Share: left},
		Options{DisplayName: "  Bob  "})

	if got := alice.Remote(); got.DisplayName != "Bob" || got.SharedFolderName != "" || got.Version != 2 {
		t.Fatalf("alice sees %+v", got)
	}
	if got := bob.Remote(); got.DisplayName != "Alice" || got.SharedFolderName != left.Name() {
		t.Fatalf("bob sees %+v", got)
	}
}

func TestStartNeedsName(t *testing.T) {
	local, remote := net.Pipe()
	defer remote.Close()

	if _, err := Start(t.Context(), local, Options{DisplayName: " \n"}); err == nil {
		t.Fatal("Start accepted an empty name")
	}
}

func TestListAndStatBothWays(t *testing.T) {
	alice, bob := startPair(t,
		Options{DisplayName: "Alice", Share: sharedFolder(t, map[string]string{
			"notes.txt": "hi", "photos/a.jpg": "jpeg",
		})},
		Options{DisplayName: "Bob", Share: sharedFolder(t, map[string]string{"song.mp3": "la"})})

	ctx := testContext(t)

	// Both sides ask at the same moment: requests may start from either end.
	var group sync.WaitGroup
	check := func(asker *Peer, wantTotal int, wantFirst string) {
		group.Go(func() {
			for range 20 {
				result, err := asker.List(ctx, "", 0, 0)
				if err != nil || result.Total != wantTotal || result.Entries[0].Name != wantFirst {
					t.Errorf("list = %+v, %v", result, err)
					return
				}
			}
		})
	}
	check(alice, 1, "song.mp3")
	check(bob, 2, "photos")
	group.Wait()

	entry, err := bob.Stat(ctx, "photos/a.jpg")
	if err != nil || entry.Name != "a.jpg" || entry.Size != 4 || entry.IsDir {
		t.Fatalf("stat = %+v, %v", entry, err)
	}

	nested, err := bob.List(ctx, "photos", 0, 10)
	if err != nil || nested.Total != 1 || nested.Entries[0].Name != "a.jpg" {
		t.Fatalf("nested = %+v, %v", nested, err)
	}
}

func TestRemoteErrorsArePlain(t *testing.T) {
	alice, _ := startPair(t,
		Options{DisplayName: "Alice"},
		Options{DisplayName: "Bob", Share: sharedFolder(t, map[string]string{"a.txt": "a"})})

	ctx := testContext(t)
	cases := []struct {
		name string
		call func() error
		code string
	}{
		{"traversal", func() error { _, err := alice.List(ctx, "../x", 0, 0); return err }, CodeBadPath},
		{"absolute", func() error { _, err := alice.Stat(ctx, "C:\\Windows"); return err }, CodeBadPath},
		{"missing", func() error { _, err := alice.Stat(ctx, "nope"); return err }, CodeNotFound},
		{"negative offset", func() error { _, err := alice.List(ctx, "", -1, 0); return err }, CodeBadRequest},
	}

	for _, tc := range cases {
		remote, ok := errors.AsType[*RemoteError](tc.call())
		if !ok || remote.Code != tc.code {
			t.Errorf("%s: got %v, want code %s", tc.name, remote, tc.code)
			continue
		}
		if !strings.HasSuffix(remote.Message, ".") || strings.Contains(remote.Message, string(filepath.Separator)) {
			t.Errorf("%s: message is not a plain sentence: %q", tc.name, remote.Message)
		}
	}
}

func TestNothingShared(t *testing.T) {
	_, bob := startPair(t, Options{DisplayName: "Alice"}, Options{DisplayName: "Bob"})

	_, err := bob.List(testContext(t), "", 0, 0)
	if remote, ok := errors.AsType[*RemoteError](err); !ok || remote.Code != CodeNotSharing {
		t.Fatalf("list of nothing: %v", err)
	}
}

func TestCustomHandlerAndUnknownMethod(t *testing.T) {
	alice, _ := startPair(t,
		Options{DisplayName: "Alice"},
		Options{DisplayName: "Bob", Handlers: map[string]Handler{
			MethodTransferOffer: func(_ context.Context, raw json.RawMessage) (any, error) {
				var offer TransferOffer
				if err := json.Unmarshal(raw, &offer); err != nil {
					return nil, err
				}

				return TransferAccept{TransferID: offer.TransferID, Accepted: true}, nil
			},
			"secret": func(context.Context, json.RawMessage) (any, error) {
				return nil, errors.New(`open C:\Users\private\file: access denied`)
			},
		}})

	ctx := testContext(t)

	var accept TransferAccept
	offer := TransferOffer{TransferID: "t1", Path: "a.txt", Direction: DirectionUpload, Size: 1}
	if err := alice.Call(ctx, MethodTransferOffer, offer, &accept); err != nil || !accept.Accepted {
		t.Fatalf("offer: %+v, %v", accept, err)
	}

	err := alice.Call(ctx, "no.such.method", nil, nil)
	if remote, ok := errors.AsType[*RemoteError](err); !ok || remote.Code != CodeUnknownMethod {
		t.Fatalf("unknown method: %v", err)
	}

	// A raw error from a handler must not reach the other computer.
	err = alice.Call(ctx, "secret", nil, nil)
	if remote, ok := errors.AsType[*RemoteError](err); !ok || remote.Code != CodeInternal ||
		strings.Contains(remote.Message, "private") {
		t.Fatalf("internal error leaked: %v", err)
	}
}

func TestOversizeAnswer(t *testing.T) {
	alice, _ := startPair(t,
		Options{DisplayName: "Alice"},
		Options{DisplayName: "Bob", Handlers: map[string]Handler{
			"big": func(context.Context, json.RawMessage) (any, error) {
				return strings.Repeat("x", maxFrame), nil
			},
		}})

	err := alice.Call(testContext(t), "big", nil, nil)
	if remote, ok := errors.AsType[*RemoteError](err); !ok || remote.Code != CodeTooLarge {
		t.Fatalf("oversize answer: %v", err)
	}
}

func TestCancelCleansUp(t *testing.T) {
	release := make(chan struct{})
	alice, _ := startPair(t,
		Options{DisplayName: "Alice"},
		Options{DisplayName: "Bob", Handlers: map[string]Handler{
			"slow": func(ctx context.Context, _ json.RawMessage) (any, error) {
				select {
				case <-release:
				case <-ctx.Done():
				}

				return struct{}{}, nil
			},
		}})

	ctx, cancel := context.WithTimeout(t.Context(), 100*time.Millisecond)
	defer cancel()

	if err := alice.Call(ctx, "slow", nil, nil); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("slow call: %v", err)
	}

	alice.mu.Lock()
	waiting := len(alice.pending)
	alice.mu.Unlock()
	if waiting != 0 {
		t.Fatalf("%d calls still waiting after the cancel", waiting)
	}

	// The late answer must be ignored and the peer must still work.
	close(release)
	time.Sleep(50 * time.Millisecond)

	if _, err := alice.List(testContext(t), "", 0, 0); err == nil {
		t.Fatal("expected a not-sharing answer, got none")
	} else if remote, ok := errors.AsType[*RemoteError](err); !ok || remote.Code != CodeNotSharing {
		t.Fatalf("peer broke after a late answer: %v", err)
	}
}

func TestTransferEventsReachSubscribers(t *testing.T) {
	alice, bob := startPair(t, Options{DisplayName: "Alice"}, Options{DisplayName: "Bob"})
	events := bob.Subscribe()
	defer events.Close()

	// An event this build does not know is dropped; a transfer event is passed on.
	if err := alice.Notify("future.thing", nil); err != nil {
		t.Fatal(err)
	}
	if err := alice.Notify(MethodTransferComplete, TransferComplete{TransferID: "t1"}); err != nil {
		t.Fatal(err)
	}

	select {
	case event := <-events.Events:
		var progress TransferComplete
		if event.Kind != EventTransfer || event.Method != MethodTransferComplete ||
			json.Unmarshal(event.Params, &progress) != nil {
			t.Fatalf("event = %+v", event)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no event arrived")
	}
}

func TestCloseWakesEveryone(t *testing.T) {
	release := make(chan struct{})
	defer close(release)

	alice, bob := startPair(t,
		Options{DisplayName: "Alice"},
		Options{DisplayName: "Bob", Handlers: map[string]Handler{
			"slow": func(ctx context.Context, _ json.RawMessage) (any, error) {
				<-ctx.Done()
				return nil, ctx.Err()
			},
		}})

	events := alice.Subscribe()
	failed := make(chan error, 1)
	go func() { failed <- alice.Call(testContext(t), "slow", nil, nil) }()
	time.Sleep(50 * time.Millisecond)

	if err := bob.Close(); err != nil {
		t.Fatal(err)
	}

	select {
	case err := <-failed:
		if err == nil {
			t.Fatal("call succeeded after close")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("waiting call was not woken")
	}

	select {
	case <-alice.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("alice did not notice the other side leaving")
	}

	var last Event
	for event := range events.Events {
		last = event
	}
	if last.Kind != EventClosed {
		t.Fatalf("last event = %+v, want closed", last)
	}

	if _, err := alice.List(testContext(t), "", 0, 0); !errors.Is(err, errClosed) {
		t.Fatalf("call after close: %v", err)
	}
	if err := alice.Close(); err != nil {
		t.Fatalf("second Close: %v", err)
	}
}
