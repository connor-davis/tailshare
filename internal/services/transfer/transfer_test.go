package transfer

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

func TestMain(tests *testing.M) {
	tailcattest.Init()
	os.Exit(tests.Run())
}

type testPair struct {
	host, join               *Manager
	hostSession, joinSession *session.Session
	hostDir, joinDir         string
	ctx                      context.Context
}

func openRoot(t *testing.T, dir string) *share.Root {
	t.Helper()
	root, err := share.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })
	return root
}

func pair(t *testing.T, hostDir, joinDir string) *testPair {
	t.Helper()
	if hostDir == "" {
		hostDir = t.TempDir()
	}
	if joinDir == "" {
		joinDir = t.TempDir()
	}
	ctx, cancel := context.WithTimeout(t.Context(), 90*time.Second)
	t.Cleanup(cancel)
	cfg := config.Config{
		Region:     tailcattest.RegionID,
		DERPMapURL: tailcattest.ServeMap(t, tailcattest.LocalDERP(t)),
	}
	host := New(openRoot(t, hostDir))
	join := New(openRoot(t, joinDir))
	hostSession, code, err := session.Host(ctx, cfg, "Host", session.Options{
		Root: host.root, Handlers: host.Handlers(),
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = hostSession.Close() })
	allowed := make(chan error, 1)
	go func() {
		for {
			if pending, ok := hostSession.Pending(); ok {
				allowed <- hostSession.Allow(pending.ID)
				return
			}
			select {
			case <-hostSession.Changes():
			case <-ctx.Done():
				allowed <- ctx.Err()
				return
			}
		}
	}()
	joinSession, err := session.Join(ctx, code.String(), cfg, "Joiner", session.Options{
		Root: join.root, Handlers: join.Handlers(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := <-allowed; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = joinSession.Close() })

	result := &testPair{host, join, hostSession, joinSession, hostDir, joinDir, ctx}
	startPeers(t, result)
	t.Cleanup(func() { _ = host.Close(); _ = join.Close() })
	return result
}

func startPeers(t *testing.T, pair *testPair) {
	t.Helper()
	var hostPeer, joinPeer *peer.Peer
	var hostTunnel, joinTunnel Tunnel
	for hostPeer == nil {
		for _, member := range pair.hostSession.Members() {
			if control, ok := pair.hostSession.Control(member.ID); ok {
				hostPeer = control
				hostTunnel, _ = pair.hostSession.Tunnel(member.ID)
			}
		}
		if hostPeer != nil {
			break
		}
		select {
		case <-pair.hostSession.Changes():
		case <-pair.ctx.Done():
			t.Fatal("host peer missing")
		}
	}
	for _, member := range pair.joinSession.Members() {
		if control, ok := pair.joinSession.Control(member.ID); ok {
			joinPeer = control
			joinTunnel, _ = pair.joinSession.Tunnel(member.ID)
		}
	}
	if err := pair.host.Attach(pair.ctx, hostTunnel, hostPeer, true); err != nil {
		t.Fatal(err)
	}
	if err := pair.join.Attach(pair.ctx, joinTunnel, joinPeer, false); err != nil {
		t.Fatal(err)
	}
}

func putFile(t *testing.T, dir, name string, size int) []byte {
	t.Helper()
	data := bytes.Repeat([]byte("tailshare-verified-file-"), size/24+1)[:size]
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o600); err != nil {
		t.Fatal(err)
	}
	return data
}

func waitFor(t *testing.T, manager *Manager, id string, predicate func(Transfer) bool) Transfer {
	t.Helper()
	subscription := manager.Subscribe()
	defer subscription.Close()
	check := func(snapshot Transfer) bool {
		if snapshot.ID != id {
			return false
		}
		if predicate(snapshot) {
			return true
		}
		if (snapshot.State == Failed || snapshot.State == Canceled) &&
			!predicate(Transfer{ID: id, State: Canceled}) {
			t.Fatalf("unexpected terminal state: %+v", snapshot)
		}
		return false
	}
	for _, snapshot := range subscription.Snapshot {
		if check(snapshot) {
			return snapshot
		}
	}
	for {
		select {
		case event, open := <-subscription.Events:
			if !open {
				t.Fatal("subscription overflowed")
			}
			if event.Transfer != nil && check(*event.Transfer) {
				return *event.Transfer
			}
		case <-t.Context().Done():
			t.Fatal("test canceled")
		case <-manager.ctx.Done():
			t.Fatal("manager closed before expected event")
		case <-time.After(60 * time.Second):
			t.Fatalf("timed out: %+v", manager.Snapshot())
		}
	}
}

func assertFile(t *testing.T, dir, name string, expected []byte) {
	t.Helper()
	actual, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		t.Fatal(err)
	}
	if sha256.Sum256(actual) != sha256.Sum256(expected) {
		t.Fatal("checksum differs")
	}
	if _, err := os.Stat(filepath.Join(dir, name+share.PartialSuffix)); !os.IsNotExist(err) {
		t.Fatalf("partial remains: %v", err)
	}
}

func TestUploadAndDownloadBothWays(t *testing.T) {
	pair := pair(t, "", "")
	for i, manager := range []*Manager{pair.host, pair.join} {
		localDir, remoteDir := pair.hostDir, pair.joinDir
		if i == 1 {
			localDir, remoteDir = remoteDir, localDir
		}
		source := fmt.Sprintf("source%d", i)
		data := putFile(t, localDir, source, 4<<20)
		uploadName := fmt.Sprintf("uploaded%d", i)
		upload, err := manager.Upload(pair.ctx, source, uploadName)
		if err != nil {
			t.Fatal(err)
		}
		waitFor(t, manager, upload.ID, func(view Transfer) bool { return view.State == Done })
		assertFile(t, remoteDir, uploadName, data)

		downloadName := fmt.Sprintf("downloaded%d", i)
		download, err := manager.Download(pair.ctx, uploadName, downloadName)
		if err != nil {
			t.Fatal(err)
		}
		waitFor(t, manager, download.ID, func(view Transfer) bool { return view.State == Done })
		assertFile(t, localDir, downloadName, data)
	}
}

func TestPauseThenResume(t *testing.T) {
	pair := pair(t, "", "")
	data := putFile(t, pair.hostDir, "source", 32<<20)
	transfer, err := pair.host.Upload(pair.ctx, "source", "received")
	if err != nil {
		t.Fatal(err)
	}
	waitFor(t, pair.join, transfer.ID, func(view Transfer) bool {
		return view.Bytes >= 1<<20 && view.State == Running
	})
	if err := pair.host.Pause(transfer.ID); err != nil {
		t.Fatal(err)
	}
	waitFor(t, pair.join, transfer.ID, func(view Transfer) bool { return view.State == Failed })
	resumed, err := pair.host.Resume(transfer.ID)
	if err != nil {
		t.Fatal(err)
	}
	result := waitFor(
		t,
		pair.host,
		resumed.ID,
		func(view Transfer) bool { return view.State == Done },
	)
	if result.Offset <= 0 {
		t.Fatal("resume started from zero")
	}
	assertFile(t, pair.joinDir, "received", data)
}

func TestSessionDropDoesNotReuseDifferentOwner(t *testing.T) {
	hostDir, joinDir := t.TempDir(), t.TempDir()
	putFile(t, hostDir, "source", 32<<20)
	first := pair(t, hostDir, joinDir)
	transfer, err := first.join.Download(first.ctx, "source", "received")
	if err != nil {
		t.Fatal(err)
	}
	waitFor(t, first.join, transfer.ID, func(view Transfer) bool {
		return view.Bytes >= 1<<20 && view.State == Running
	})
	_ = first.joinSession.Close()
	_ = first.join.Close()
	_ = first.host.Close()
	second := pair(t, hostDir, joinDir)
	resumed, err := second.join.Download(second.ctx, "source", "received")
	if err != nil {
		t.Fatal(err)
	}
	waitFor(t, second.join, resumed.ID, func(view Transfer) bool { return view.State == Failed })
	if size, err := second.join.root.PartialSize("received"); err != nil || size == 0 {
		t.Fatalf("another identity removed the partial: %d %v", size, err)
	}
}

func TestCancelRemovesPartial(t *testing.T) {
	for _, side := range []string{"sender", "receiver"} {
		t.Run(side, func(t *testing.T) {
			pair := pair(t, "", "")
			putFile(t, pair.hostDir, "source", 32<<20)
			transfer, err := pair.host.Upload(pair.ctx, "source", "received")
			if err != nil {
				t.Fatal(err)
			}
			waitFor(t, pair.join, transfer.ID, func(view Transfer) bool {
				return view.Bytes >= 1<<20 && view.State == Running
			})
			canceler := pair.host
			if side == "receiver" {
				canceler = pair.join
			}
			if err := canceler.Cancel(transfer.ID); err != nil {
				t.Fatal(err)
			}
			canceled := func(view Transfer) bool { return view.State == Canceled }
			waitFor(t, pair.host, transfer.ID, canceled)
			waitFor(t, pair.join, transfer.ID, canceled)
			// stop waits for the receive handle to close before removing the partial.
			pair.join.mu.Lock()
			done := pair.join.jobs[transfer.ID].done
			pair.join.mu.Unlock()
			<-done
			assertMissing(t, pair.joinDir, "received")
			assertMissing(t, pair.joinDir, "received"+share.PartialSuffix)
		})
	}
}

func TestQueueRunsTwoAtATime(t *testing.T) {
	pair := pair(t, "", "")
	data := putFile(t, pair.hostDir, "source", 32<<20)
	// Queue before attachment is also supported. Freeze scheduling while all three enter.
	pair.join.mu.Lock()
	pair.join.attached = false
	pair.join.mu.Unlock()
	var ids []string
	for i := range 3 {
		transfer, err := pair.join.Download(pair.ctx, "source", fmt.Sprintf("received%d", i))
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, transfer.ID)
	}
	pair.join.mu.Lock()
	pair.join.attached = true
	pair.join.scheduleLocked()
	snapshot := pair.join.snapshotLocked()
	pair.join.mu.Unlock()
	if snapshot[0].State != Starting || snapshot[1].State != Starting || snapshot[2].State != Queued {
		t.Fatalf("queue: %+v", snapshot)
	}
	subscription := pair.join.Subscribe()
	defer subscription.Close()
	for _, id := range ids {
		waitFor(t, pair.join, id, func(view Transfer) bool { return view.State == Done })
	}
	for i := range 3 {
		assertFile(t, pair.joinDir, fmt.Sprintf("received%d", i), data)
	}
	for _, snapshot := range pair.join.Snapshot() {
		if snapshot.State != Done {
			t.Fatalf("unfinished: %+v", snapshot)
		}
	}
}

func TestBusyRefusal(t *testing.T) {
	pair := pair(t, "", "")
	putFile(t, pair.hostDir, "source", 4<<20)
	for range 2 {
		offer := peer.TransferOffer{TransferID: rand.Text(), Path: "source", Direction: peer.DirectionDownload}
		var answer peer.TransferAccept
		err := pair.join.peer.Call(pair.ctx, peer.MethodTransferOffer, offer, &answer)
		if err != nil {
			t.Fatal(err)
		}
		if !answer.Accepted {
			t.Fatalf("offer refused: %+v", answer)
		}
	}
	offer := peer.TransferOffer{TransferID: rand.Text(), Path: "source", Direction: peer.DirectionDownload}
	var answer peer.TransferAccept
	if err := pair.join.peer.Call(pair.ctx, peer.MethodTransferOffer, offer, &answer); err != nil {
		t.Fatal(err)
	}
	if answer.Accepted || answer.Reason != errBusy.Error() {
		t.Fatalf("busy: %+v", answer)
	}
}
