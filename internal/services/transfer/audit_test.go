package transfer

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
)

func TestAuditRefusedOffersNotRetained(t *testing.T) {
	manager := offerManager(t, t.TempDir())
	for range 1000 {
		for _, name := range []string{strings.Repeat("a", 5000), "missing/file"} {
			if callOffer(t, manager, uploadOffer(name)).Accepted {
				t.Fatal("bad offer accepted")
			}
		}
	}
	if len(manager.Snapshot()) != 0 {
		t.Fatalf("retained %d refused offers", len(manager.Snapshot()))
	}
}

func TestAuditHistoryBounded(t *testing.T) {
	manager := New(nil)
	defer manager.Close()
	for range 1000 {
		manager.mu.Lock()
		item := manager.newJobLocked(rand.Text(), "file", "file", peer.DirectionUpload, true)
		manager.mu.Unlock()
		manager.finish(item, nil)
	}
	if len(manager.Snapshot()) > 200 {
		t.Fatal("unbounded terminal history")
	}
}

func TestAuditUnattachedConversationDenied(t *testing.T) {
	manager := New(nil)
	defer manager.Close()
	manager.peer = new(peer.Peer)
	raw, _ := json.Marshal(uploadOffer("file"))
	for _, handler := range manager.Handlers() {
		_, err := handler(t.Context(), raw)
		var remote *peer.RemoteError
		if !errors.As(err, &remote) || remote.Code != peer.CodeDenied {
			t.Fatalf("wrong peer not denied: %v", err)
		}
	}
	if len(manager.Snapshot()) != 0 {
		t.Fatal("wrong peer created work")
	}
}

func TestAuditUploadFreeSpace(t *testing.T) {
	manager := offerManager(t, t.TempDir())
	manager.freeSpace = func(*share.Root) (int64, error) { return (64 << 20) + 2, nil }
	if callOffer(t, manager, uploadOffer("file")).Accepted {
		t.Fatal("offer exceeds free space minus reserve")
	}
	if len(manager.Snapshot()) != 0 {
		t.Fatal("refused disk offer retained")
	}
}

func TestAuditHashCancellation(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "hash")
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if err := file.Truncate(256 << 20); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	before := time.Now()
	_, count, err := hashFileContext(ctx, file)
	if !errors.Is(err, context.Canceled) || count != 0 || time.Since(before) > time.Second {
		t.Fatalf("hash ignored cancellation: %d %v", count, err)
	}
}

func TestAuditLargeDownloadOfferTimeout(t *testing.T) {
	pair := pair(t, "", "")
	data := putFile(t, pair.hostDir, "source", 8<<20)
	pair.host.hashSource = func(ctx context.Context, file *os.File) (string, int64, error) {
		timer := time.NewTimer(35 * time.Second)
		defer timer.Stop()
		select {
		case <-ctx.Done():
			return "", 0, ctx.Err()
		case <-timer.C:
		}
		return hashFileContext(ctx, file)
	}
	item, err := pair.join.Download(pair.ctx, "source", "received")
	if err != nil {
		t.Fatal(err)
	}
	waitFor(t, pair.join, item.ID, func(view Transfer) bool { return view.State == Done })
	assertFile(t, pair.joinDir, "received", data)
}

func TestAuditOtherOwnerOfferRefused(t *testing.T) {
	manager := offerManager(t, t.TempDir())
	if err := manager.root.ClaimPartial("file", "other", checksum([]byte("old")), 3); err != nil {
		t.Fatal(err)
	}
	if err := receiveTo(manager.root, "file", 0, 3, strings.NewReader("old")); err != nil {
		t.Fatal(err)
	}
	if callOffer(t, manager, uploadOffer("file")).Accepted {
		t.Fatal("different owner reused partial")
	}
	if size, err := manager.root.PartialSize("file"); err != nil || size != 3 {
		t.Fatalf("foreign partial changed: %d %v", size, err)
	}
}

func TestAuditSenderFailureRemovesUploadPartial(t *testing.T) {
	pair := pair(t, "", "")
	putFile(t, pair.hostDir, "source", 1024)
	pair.host.hashSource = func(ctx context.Context, file *os.File) (string, int64, error) {
		hash, size, err := hashFileContext(ctx, file)
		if err == nil {
			err = os.Truncate(file.Name(), 3)
		}
		return hash, size, err
	}
	item, err := pair.host.Upload(pair.ctx, "source", "received")
	if err != nil {
		t.Fatal(err)
	}
	waitFor(t, pair.join, item.ID, func(view Transfer) bool { return view.State == Canceled })
	pair.join.mu.Lock()
	done := pair.join.jobs[item.ID].done
	pair.join.mu.Unlock()
	<-done
	assertMissing(t, pair.joinDir, "received"+share.PartialSuffix)
}

func TestAuditCancelWhileHashing(t *testing.T) {
	dir := t.TempDir()
	file, err := os.Create(dir + "/source")
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(256 << 20); err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	manager := offerManager(t, dir)
	started := make(chan struct{})
	manager.hashSource = func(ctx context.Context, file *os.File) (string, int64, error) {
		close(started)
		return hashFileContext(ctx, file)
	}
	item, err := manager.Upload(t.Context(), "source", "received")
	if err != nil {
		t.Fatal(err)
	}
	<-started
	before := time.Now()
	if err := manager.Cancel(item.ID); err != nil {
		t.Fatal(err)
	}
	if time.Since(before) > time.Second {
		t.Fatal("Cancel waited for hashing")
	}
}

func TestAuditOfferRateLimited(t *testing.T) {
	pair := pair(t, "", "")
	var answer peer.TransferAccept
	for range 4 {
		offer := uploadOffer(strings.Repeat("x", 5000))
		if err := pair.join.peer.Call(pair.ctx, peer.MethodTransferOffer, offer, &answer); err != nil {
			t.Fatal(err)
		}
	}
	err := pair.join.peer.Call(pair.ctx, peer.MethodTransferOffer, uploadOffer("file"), &answer)
	var remote *peer.RemoteError
	if !errors.As(err, &remote) || remote.Code != peer.CodeBusy {
		t.Fatalf("offer rate unbounded: %v", err)
	}
}
