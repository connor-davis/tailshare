package transfer

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/Polyphron-AI/tailshare/internal/services/peer"
	"github.com/Polyphron-AI/tailshare/internal/services/share"
)

func offerManager(t *testing.T, dir string) *Manager {
	t.Helper()
	manager := New(openRoot(t, dir))
	manager.attached = true
	t.Cleanup(func() { _ = manager.Close() })
	return manager
}

func callOffer(t *testing.T, manager *Manager, offer peer.TransferOffer) peer.TransferAccept {
	t.Helper()
	raw, err := json.Marshal(offer)
	if err != nil {
		t.Fatal(err)
	}
	result, err := manager.offer(t.Context(), raw)
	if err != nil {
		t.Fatal(err)
	}
	return result.(peer.TransferAccept)
}

func uploadOffer(name string) peer.TransferOffer {
	return peer.TransferOffer{
		TransferID: rand.Text(), Path: name, Direction: peer.DirectionUpload,
		Size: 3, SHA256: checksum([]byte("new")),
	}
}

func TestExistingFileRefused(t *testing.T) {
	dir := t.TempDir()
	original := putFile(t, dir, "exists", 100)
	manager := offerManager(t, dir)
	if answer := callOffer(t, manager, uploadOffer("exists")); answer.Accepted {
		t.Fatal("overwritten")
	}
	assertFile(t, dir, "exists", original)
}

func TestOfferPathTable(t *testing.T) {
	outside := t.TempDir()
	sentinel := putFile(t, outside, "sentinel", 30)
	dir := filepath.Join(outside, "shared")
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	manager := offerManager(t, dir)
	paths := []string{
		"../sentinel", "/abs", `C:\x`, "a/../b", "CON.txt", "x.tailshare-part",
		"a:stream", `a\b`, "", "x.TAILSHARE-PART", "x.tailshare-part./child",
	}
	for _, direction := range []peer.Direction{peer.DirectionUpload, peer.DirectionDownload} {
		for _, path := range paths {
			offer := uploadOffer(path)
			offer.Direction = direction
			if answer := callOffer(t, manager, offer); answer.Accepted {
				t.Fatalf("accepted %s %q", direction, path)
			}
		}
	}
	assertFile(t, outside, "sentinel", sentinel)
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 0 {
		t.Fatalf("created files: %v %v", entries, err)
	}
}

func TestEscapingLinkRefused(t *testing.T) {
	for _, kind := range []string{"symlink", "junction"} {
		t.Run(kind, func(t *testing.T) {
			outside, inside := t.TempDir(), t.TempDir()
			sentinel := putFile(t, outside, "sentinel", 20)
			link := filepath.Join(inside, "escape")
			if kind == "junction" {
				if runtime.GOOS != "windows" {
					t.Skip("junctions exist only on Windows")
				}
				command := exec.Command("cmd", "/c", "mklink", "/J", link, outside)
				output, err := command.CombinedOutput()
				if err != nil {
					t.Skipf("junctions are not allowed here: %s", output)
				}
			} else if err := os.Symlink(outside, link); err != nil {
				t.Skipf("symlinks are not allowed here: %v", err)
			}
			manager := offerManager(t, inside)
			for _, direction := range []peer.Direction{peer.DirectionUpload, peer.DirectionDownload} {
				offer := uploadOffer("escape/sentinel")
				offer.Direction = direction
				if callOffer(t, manager, offer).Accepted {
					t.Fatal("escaping link accepted")
				}
			}
			assertFile(t, outside, "sentinel", sentinel)
			assertMissing(t, outside, "sentinel"+share.PartialSuffix)
		})
	}
}

func TestPartialNamesHidden(t *testing.T) {
	dir := t.TempDir()
	putFile(t, dir, "private.TAILSHARE-PART", 10)
	manager := offerManager(t, dir)
	entries, total, err := manager.root.List("", 0, 100)
	if err != nil || total != 0 || len(entries) != 0 {
		t.Fatalf("partial visible: %v %v", entries, err)
	}
	if _, err := manager.root.Stat("private.TAILSHARE-PART"); err == nil {
		t.Fatal("partial readable")
	}
}

func TestDuplicateOfferAndWaiterRefused(t *testing.T) {
	dir := t.TempDir()
	putFile(t, dir, "source", 20)
	manager := offerManager(t, dir)
	offer := peer.TransferOffer{TransferID: rand.Text(), Path: "source", Direction: peer.DirectionDownload}
	if !callOffer(t, manager, offer).Accepted {
		t.Fatal("initial offer refused")
	}
	if callOffer(t, manager, offer).Accepted {
		t.Fatal("duplicate active offer accepted")
	}
	manager.mu.Lock()
	item := manager.jobs[offer.TransferID]
	manager.mu.Unlock()
	if err := manager.register(item); err == nil {
		t.Fatal("duplicate waiter replaced")
	}
	if err := manager.stop(offer.TransferID, Canceled, false); err != nil {
		t.Fatal(err)
	}
	if callOffer(t, manager, offer).Accepted {
		t.Fatal("duplicate completed ID accepted")
	}
}

func TestPeerIDValidation(t *testing.T) {
	manager := offerManager(t, t.TempDir())
	for _, id := range []string{"", "short", strings.Repeat("A", 25), strings.Repeat("A", 27),
		strings.Repeat("a", 26), strings.Repeat("1", 26), strings.Repeat("/", 26)} {
		offer := uploadOffer("file")
		offer.TransferID = id
		raw, _ := json.Marshal(offer)
		if _, err := manager.offer(t.Context(), raw); err == nil {
			t.Fatalf("accepted offer ID %q", id)
		}
		raw, _ = json.Marshal(peer.TransferResume{TransferID: id})
		if _, err := manager.resumeOffer(t.Context(), raw); err == nil {
			t.Fatalf("accepted resume ID %q", id)
		}
	}
	if !validID(rand.Text()) {
		t.Fatal("rand.Text ID refused")
	}
	host, join := net.Pipe()
	routed := make(chan struct{})
	go func() { manager.route(host); close(routed) }()
	if _, err := join.Write([]byte(strings.Repeat("!", 26))); err != nil {
		t.Fatal(err)
	}
	<-routed
	_ = join.Close()
}

func TestPartialLinkRefused(t *testing.T) {
	dir := t.TempDir()
	root := openRoot(t, dir)
	putFile(t, dir, "original", 20)
	target := filepath.Join(dir, "original")
	partial := filepath.Join(dir, "file"+share.PartialSuffix)
	if err := os.Symlink(target, partial); err != nil {
		t.Skipf("symlinks are not allowed here: %v", err)
	}
	if _, err := root.PartialSize("file"); err == nil {
		t.Fatal("partial link followed")
	}
	if file, err := root.OpenPartial("file", 0); err == nil {
		_ = file.Close()
		t.Fatal("partial link opened")
	}
}

// Check the incoming request shape without creating a data stream.
func TestResumeOffsetAndHashChecked(t *testing.T) {
	dir := t.TempDir()
	putFile(t, dir, "source", 20)
	manager := offerManager(t, dir)
	offer := peer.TransferOffer{TransferID: rand.Text(), Path: "source", Direction: peer.DirectionDownload}
	answer := callOffer(t, manager, offer)
	for _, resume := range []peer.TransferResume{
		{TransferID: offer.TransferID, Offset: -1, SHA256: answer.SHA256},
		{TransferID: offer.TransferID, Offset: 21, SHA256: answer.SHA256},
		{TransferID: offer.TransferID, Offset: 0, SHA256: checksum(nil)},
	} {
		raw, _ := json.Marshal(resume)
		if _, err := manager.resumeOffer(context.Background(), raw); err == nil {
			t.Fatal("bad resume accepted")
		}
	}
}

func TestKnownIDRefusedInEveryState(t *testing.T) {
	dir := t.TempDir()
	putFile(t, dir, "source", 20)
	manager := offerManager(t, dir)
	id := rand.Text()
	manager.mu.Lock()
	item := manager.newJobLocked(id, "source", "source", peer.DirectionDownload, false)
	manager.mu.Unlock()
	for _, state := range []State{Queued, Starting, Running, Paused, Failed, Done, Canceled} {
		manager.mu.Lock()
		item.view.State = state
		manager.mu.Unlock()
		offer := peer.TransferOffer{TransferID: id, Path: "source", Direction: peer.DirectionDownload}
		if callOffer(t, manager, offer).Accepted {
			t.Fatalf("known %s ID accepted", state)
		}
	}
}

func TestUnknownAndLateStreamsClosed(t *testing.T) {
	manager := offerManager(t, t.TempDir())
	for _, known := range []bool{false, true} {
		id := rand.Text()
		if known {
			manager.mu.Lock()
			item := manager.newJobLocked(id, "file", "file", peer.DirectionUpload, false)
			item.view.State = Failed
			manager.mu.Unlock()
		}
		host, join := net.Pipe()
		routed := make(chan struct{})
		go func() { manager.route(host); close(routed) }()
		if _, err := join.Write([]byte(id)); err != nil {
			t.Fatal(err)
		}
		<-routed
		if _, err := join.Write([]byte("unwanted")); err == nil {
			t.Fatal("unknown stream left open")
		}
		_ = join.Close()
	}
}
