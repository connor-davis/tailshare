package tailshare

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

func TestMain(tests *testing.M) { tailcattest.Init(); os.Exit(tests.Run()) }

// startHost shares a folder holding one file and one subfolder.
func startHost(t *testing.T, mapURL string) (*session.Session, string) {
	t.Helper()
	rooms := t.TempDir()
	root, err := share.OpenRoom(rooms, "room")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })

	shared := filepath.Join(rooms, "room")
	if err := os.WriteFile(filepath.Join(shared, "hello.txt"), []byte("hi"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(shared, "docs"), 0o700); err != nil {
		t.Fatal(err)
	}

	host, code, err := session.Host(t.Context(), config.Config{DERPMapURL: mapURL, Region: tailcattest.RegionID}, "Desktop",
		session.Options{Root: root, RoomName: "Desk"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = host.Close() })

	return host, code.String()
}

func approve(t *testing.T, host *session.Session) {
	t.Helper()
	deadline := time.After(40 * time.Second)
	for {
		if pending, ok := host.Pending(); ok {
			if err := host.Allow(pending.ID); err != nil {
				t.Fatal(err)
			}
			return
		}
		select {
		case <-host.Changes():
		case <-deadline:
			t.Fatal("no join request arrived")
		}
	}
}

func TestJoinAndList(t *testing.T) {
	mapURL := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	host, code := startHost(t, mapURL)

	client := NewClient("Phone", mapURL, int(tailcattest.RegionID))
	t.Cleanup(func() { _ = client.Leave() })

	joined := make(chan error, 1)
	go func() { joined <- client.Join(code) }()
	approve(t, host)
	if err := <-joined; err != nil {
		t.Fatal(err)
	}

	if !client.Connected() || client.RoomName() != "Desk" {
		t.Fatalf("connected=%v room=%q", client.Connected(), client.RoomName())
	}

	body, err := client.ListRemote("")
	if err != nil {
		t.Fatal(err)
	}
	var result peer.ListResult
	if err := json.Unmarshal([]byte(body), &result); err != nil {
		t.Fatal(err)
	}
	if result.Total != 2 || len(result.Entries) != 2 {
		t.Fatalf("got %+v, want two entries", result)
	}

	// A path that tries to leave the shared folder never reaches the host.
	for _, bad := range []string{"..", "../x", "/etc", `a\b`, "C:"} {
		if _, err := client.ListRemote(bad); err == nil {
			t.Fatalf("path %q was allowed", bad)
		}
	}

	if err := client.Leave(); err != nil {
		t.Fatal(err)
	}
	if client.Connected() {
		t.Fatal("still connected after Leave")
	}
	if _, err := client.ListRemote(""); err == nil {
		t.Fatal("list worked after Leave")
	}
}

func TestJoinBadCode(t *testing.T) {
	client := NewClient("Phone", "", 0)
	err := client.Join("nope")
	if err == nil {
		t.Fatal("bad code accepted")
	}
	if errors.Is(err, errCancelled) {
		t.Fatal("a failed join was reported as cancelled")
	}
	if client.Connected() {
		t.Fatal("connected with a bad code")
	}
}

func TestCancelStopsJoin(t *testing.T) {
	mapURL := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	host, code := startHost(t, mapURL)
	_ = host

	client := NewClient("Phone", mapURL, int(tailcattest.RegionID))
	joined := make(chan error, 1)
	go func() { joined <- client.Join(code) }()

	// Wait until the host sees the request, then give up on the phone side.
	for {
		if _, ok := host.Pending(); ok {
			break
		}
		select {
		case <-host.Changes():
		case <-time.After(40 * time.Second):
			t.Fatal("no join request arrived")
		}
	}
	client.Cancel()

	select {
	case err := <-joined:
		if !errors.Is(err, errCancelled) {
			t.Fatalf("want the cancelled error, got %v", err)
		}
	case <-time.After(20 * time.Second):
		t.Fatal("join did not stop")
	}
}

func TestWithDetailsShowsHiddenCause(t *testing.T) {
	step := &session.StepError{Text: "Could not connect everyone in the share.", Cause: errors.New("open link: timeout")}
	if got := withDetails(step).Error(); got != "Could not connect everyone in the share.\n\nDetails: open link: timeout" {
		t.Fatalf("step details = %q", got)
	}

	remote := &peer.RemoteError{Code: peer.CodeJoinFailed, Message: "Could not connect everyone in the share."}
	if got := withDetails(remote).Error(); !strings.Contains(got, `answered "`+peer.CodeJoinFailed+`"`) {
		t.Fatalf("remote details = %q", got)
	}

	plain := errors.New("plain")
	if withDetails(plain) != plain {
		t.Fatal("a plain error should pass through unchanged")
	}
}

func TestNextEvent(t *testing.T) {
	mapURL := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	host, code := startHost(t, mapURL)

	client := NewClient("Phone", mapURL, int(tailcattest.RegionID))
	t.Cleanup(func() { _ = client.Leave() })

	joined := make(chan error, 1)
	go func() { joined <- client.Join(code) }()
	approve(t, host)
	if err := <-joined; err != nil {
		t.Fatal(err)
	}

	type result struct {
		event string
		err   error
	}
	read := func() chan result {
		out := make(chan result, 1)
		go func() {
			event, err := client.NextEvent()
			out <- result{event, err}
		}()
		return out
	}
	wait := func(out chan result) result {
		select {
		case got := <-out:
			return got
		case <-time.After(5 * time.Second):
			t.Fatal("NextEvent did not return")
			return result{}
		}
	}

	// The first call subscribes and reports once, since changes may have been missed.
	if got := wait(read()); got.err != nil || got.event != `{"type":"files.changed"}` {
		t.Fatalf("first = %+v", got)
	}

	pending := read()
	host.NotifyShareChanged()
	if got := wait(pending); got.err != nil || got.event != `{"type":"files.changed"}` {
		t.Fatalf("changed = %+v", got)
	}

	// Leave wakes a blocked call, which reports the close once and then errors.
	pending = read()
	time.Sleep(100 * time.Millisecond)
	if err := client.Leave(); err != nil {
		t.Fatal(err)
	}
	if got := wait(pending); got.err != nil || got.event != `{"type":"closed"}` {
		t.Fatalf("closed = %+v", got)
	}
	if got := wait(read()); got.err == nil {
		t.Fatalf("after close = %+v, want an error", got)
	}
}
