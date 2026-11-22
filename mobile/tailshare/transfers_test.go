package tailshare

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/services/transfer"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

// transferRig is a host that can transfer files plus a phone joined to it.
type transferRig struct {
	client    *Client
	shared    string
	outbox    string
	downloads string
}

// startTransferRig joins a phone to a host whose transfer manager is attached to it.
func startTransferRig(t *testing.T) *transferRig {
	t.Helper()
	mapURL := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))

	rooms := t.TempDir()
	root, err := share.OpenRoom(rooms, "room")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })

	manager := transfer.New(root)
	t.Cleanup(func() { _ = manager.Close() })

	host, code, err := session.Host(t.Context(),
		config.Config{DERPMapURL: mapURL, Region: tailcattest.RegionID}, "Desktop",
		session.Options{Root: root, RoomName: "Desk", Handlers: manager.Handlers()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = host.Close() })

	client := NewClient("Phone", mapURL, int(tailcattest.RegionID))
	t.Cleanup(func() { _ = client.Leave() })

	joined := make(chan error, 1)
	go func() { joined <- client.Join(code.String()) }()
	approve(t, host)
	if err := <-joined; err != nil {
		t.Fatal(err)
	}

	// The host registers the phone's control a moment after the join returns.
	deadline := time.Now().Add(10 * time.Second)
	for {
		control, ok := host.Control(client.session.SelfID())
		tunnel, tunnelOK := host.Tunnel(client.session.SelfID())
		if ok && tunnelOK {
			if err := manager.Attach(t.Context(), tunnel, control, true); err != nil {
				t.Fatal(err)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("host never registered the phone")
		}
		time.Sleep(20 * time.Millisecond)
	}

	rig := &transferRig{
		client: client, shared: filepath.Join(rooms, "room"),
		outbox: t.TempDir(), downloads: t.TempDir(),
	}
	if err := client.EnableTransfers(rig.outbox, rig.downloads); err != nil {
		t.Fatal(err)
	}

	return rig
}

// waitDone reads transfer events until the id reports done, and returns every event seen.
func waitDone(t *testing.T, client *Client, id string) []transferEvent {
	t.Helper()
	var seen []transferEvent
	deadline := time.After(60 * time.Second)
	for {
		next := make(chan string, 1)
		go func() {
			body, _ := client.NextTransferEvent()
			next <- body
		}()
		select {
		case body := <-next:
			var event transferEvent
			if err := json.Unmarshal([]byte(body), &event); err != nil {
				t.Fatal(err)
			}
			if event.ID != id {
				continue
			}
			seen = append(seen, event)
			if event.State == "done" {
				return seen
			}
			if event.State == "failed" || event.State == "canceled" {
				t.Fatalf("transfer ended %s: %s", event.State, event.Reason)
			}
		case <-deadline:
			t.Fatalf("transfer %s never finished; saw %+v", id, seen)
		}
	}
}

func TestTransferBothWays(t *testing.T) {
	rig := startTransferRig(t)

	// Room to phone.
	want := bytes.Repeat([]byte("tailshare"), 1<<17)
	if err := os.WriteFile(filepath.Join(rig.shared, "big.bin"), want, 0o600); err != nil {
		t.Fatal(err)
	}
	id, err := rig.client.Download("big.bin")
	if err != nil {
		t.Fatal(err)
	}
	events := waitDone(t, rig.client, id)
	last := events[len(events)-1]
	if last.Direction != "download" || last.Name != "big.bin" || last.Done != int64(len(want)) || last.Size != int64(len(want)) {
		t.Fatalf("last event = %+v", last)
	}
	got, err := os.ReadFile(filepath.Join(rig.downloads, last.Name))
	if err != nil || !bytes.Equal(got, want) {
		t.Fatalf("downloaded bytes differ (err %v)", err)
	}

	// Phone to room, from a folder under the outbox like the picker's cache copy.
	if err := os.Mkdir(filepath.Join(rig.outbox, "picked"), 0o700); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(rig.outbox, "picked", "photo.bin")
	up := bytes.Repeat([]byte("phone"), 1<<17)
	if err := os.WriteFile(source, up, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(rig.shared, "docs"), 0o700); err != nil {
		t.Fatal(err)
	}
	id, err = rig.client.Upload(source, "docs")
	if err != nil {
		t.Fatal(err)
	}
	events = waitDone(t, rig.client, id)
	if last = events[len(events)-1]; last.Direction != "upload" || last.Done != int64(len(up)) {
		t.Fatalf("last upload event = %+v", last)
	}
	got, err = os.ReadFile(filepath.Join(rig.shared, "docs", "photo.bin"))
	if err != nil || !bytes.Equal(got, up) {
		t.Fatalf("uploaded bytes differ (err %v)", err)
	}
}

func TestTransferRejectsEscape(t *testing.T) {
	rig := startTransferRig(t)

	for _, bad := range []string{"", "../x", "/etc/passwd", `a\b`} {
		if _, err := rig.client.Download(bad); err == nil {
			t.Fatalf("download %q was allowed", bad)
		}
	}

	outside := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(outside, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := rig.client.Upload(outside, ""); err == nil {
		t.Fatal("upload from outside the outbox was allowed")
	}

	inside := filepath.Join(rig.outbox, "ok.txt")
	if err := os.WriteFile(inside, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"../..", "/etc", `a\b`} {
		if _, err := rig.client.Upload(inside, bad); err == nil {
			t.Fatalf("upload into %q was allowed", bad)
		}
	}
}

func TestTransferBeforeEnable(t *testing.T) {
	client := NewClient("Phone", "", 0)
	if _, err := client.Download("a"); err == nil {
		t.Fatal("download worked before EnableTransfers")
	}
	if _, err := client.Upload("/a", ""); err == nil {
		t.Fatal("upload worked before EnableTransfers")
	}
	if _, err := client.NextTransferEvent(); err == nil {
		t.Fatal("events worked before EnableTransfers")
	}
	if err := client.EnableTransfers(t.TempDir(), t.TempDir()); err == nil {
		t.Fatal("EnableTransfers worked without a room")
	}
}

func TestLeaveWakesTransferReader(t *testing.T) {
	rig := startTransferRig(t)

	type result struct {
		body string
		err  error
	}
	out := make(chan result, 1)
	go func() {
		// The queue is empty, so this blocks until Leave.
		body, err := rig.client.NextTransferEvent()
		out <- result{body, err}
	}()
	time.Sleep(100 * time.Millisecond)

	if err := rig.client.Leave(); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-out:
		if got.err != nil || got.body != `{"type":"closed"}` {
			t.Fatalf("got %+v", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("NextTransferEvent did not return after Leave")
	}
	if _, err := rig.client.NextTransferEvent(); err == nil {
		t.Fatal("events kept coming after Leave")
	}
}
