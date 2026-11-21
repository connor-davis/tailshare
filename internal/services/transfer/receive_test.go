package transfer

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
)

func checksum(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func TestHashMismatchRemovesPartial(t *testing.T) {
	dir := t.TempDir()
	root := openRoot(t, dir)
	if err := receiveTo(root, "file", 0, 5, bytes.NewBufferString("wrong")); err != nil {
		t.Fatal(err)
	}
	if err := verifyAndCommit(root, "file", checksum([]byte("right"))); !errors.Is(err, errChecksum) {
		t.Fatalf("checksum: %v", err)
	}
	assertMissing(t, dir, "file")
	assertMissing(t, dir, "file"+share.PartialSuffix)
}

func TestCommitRefusesExisting(t *testing.T) {
	dir := t.TempDir()
	root := openRoot(t, dir)
	data := []byte("incoming")
	if err := receiveTo(root, "file", 0, int64(len(data)), bytes.NewReader(data)); err != nil {
		t.Fatal(err)
	}
	putFile(t, dir, "file", 7)
	if err := verifyAndCommit(root, "file", checksum(data)); !errors.Is(err, share.ErrExists) {
		t.Fatalf("commit: %v", err)
	}
	assertFile(t, dir, "file"+share.PartialSuffix, data)
}

func TestCommitNeverReplacesExisting(t *testing.T) {
	dir := t.TempDir()
	root := openRoot(t, dir)
	original := putFile(t, dir, "file", 64)
	if err := receiveTo(root, "file", 0, 3, bytes.NewBufferString("new")); err != nil {
		t.Fatal(err)
	}
	if err := root.Commit("file"); !errors.Is(err, share.ErrExists) {
		t.Fatalf("commit: %v", err)
	}
	actual, err := os.ReadFile(filepath.Join(dir, "file"))
	if err != nil || !bytes.Equal(actual, original) {
		t.Fatalf("existing file changed: %v", err)
	}
	partial, err := os.ReadFile(filepath.Join(dir, "file"+share.PartialSuffix))
	if err != nil || string(partial) != "new" {
		t.Fatalf("partial changed: %q %v", partial, err)
	}
}

func TestExtraBytesIgnored(t *testing.T) {
	dir := t.TempDir()
	root := openRoot(t, dir)
	source := bytes.NewBuffer(bytes.Repeat([]byte("x"), 107))
	if err := receiveTo(root, "file", 0, 7, source); err != nil {
		t.Fatal(err)
	}
	if source.Len() != 100 {
		t.Fatalf("read past declared size: %d", source.Len())
	}
	if err := verifyAndCommit(root, "file", checksum(bytes.Repeat([]byte("x"), 7))); err != nil {
		t.Fatal(err)
	}
	assertFile(t, dir, "file", bytes.Repeat([]byte("x"), 7))
}

func assertMissing(t *testing.T, dir, name string) {
	t.Helper()
	if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
		t.Fatalf("%s still exists: %v", name, err)
	}
}

func TestCancelOldAttemptKeepsResumedPartial(t *testing.T) {
	dir := t.TempDir()
	manager := New(openRoot(t, dir))
	t.Cleanup(func() { _ = manager.Close() })
	if err := receiveTo(manager.root, "file", 0, 3, bytes.NewBufferString("new")); err != nil {
		t.Fatal(err)
	}
	manager.mu.Lock()
	previous := manager.newJobLocked(rand.Text(), "file", "source", peer.DirectionDownload, true)
	previous.view.State = Paused
	resumed := manager.newJobLocked(rand.Text(), "FILE", "source", peer.DirectionDownload, true)
	resumed.view.State, resumed.working = Running, true
	manager.mu.Unlock()
	defer func() {
		manager.mu.Lock()
		resumed.working = false
		manager.mu.Unlock()
	}()
	if err := manager.stop(previous.view.ID, Canceled, false); err != nil {
		t.Fatal(err)
	}
	actual, err := os.ReadFile(filepath.Join(dir, "file"+share.PartialSuffix))
	if err != nil || string(actual) != "new" {
		t.Fatalf("resumed partial removed: %q %v", actual, err)
	}
}

func TestShortSourceFails(t *testing.T) {
	dir := t.TempDir()
	putFile(t, dir, "source", 3)
	manager := New(openRoot(t, dir))
	t.Cleanup(func() { _ = manager.Close() })
	manager.mu.Lock()
	item := manager.newJobLocked(rand.Text(), "source", "target", peer.DirectionUpload, true)
	item.view.Size = 100
	manager.mu.Unlock()
	var destination bytes.Buffer
	if err := manager.send(item, &destination); err == nil || err.Error() != "The file changed while sending." {
		t.Fatalf("short source: %v", err)
	}
	if destination.Len() != 3 {
		t.Fatalf("sent %d bytes", destination.Len())
	}
}

func TestStaleResumePrefixRemoved(t *testing.T) {
	dir := t.TempDir()
	root := openRoot(t, dir)
	if err := receiveTo(root, "file", 0, 3, bytes.NewBufferString("old")); err != nil {
		t.Fatal(err)
	}
	if err := receiveTo(root, "file", 3, 6, bytes.NewBufferString("new")); err != nil {
		t.Fatal(err)
	}
	if err := verifyAndCommit(root, "file", checksum([]byte("newnew"))); !errors.Is(err, errChecksum) {
		t.Fatalf("stale prefix: %v", err)
	}
	assertMissing(t, dir, "file")
	assertMissing(t, dir, "file"+share.PartialSuffix)
}

func TestDownloadPinsRootThroughResume(t *testing.T) {
	roomDir, firstDir, secondDir := t.TempDir(), t.TempDir(), t.TempDir()
	manager := New(openRoot(t, roomDir))
	defer manager.Close()
	first, second := openRoot(t, firstDir), openRoot(t, secondDir)
	manager.SetDownloadRoot(first)
	queued, err := manager.Download(t.Context(), "nested/report.pdf", "report.pdf")
	if err != nil {
		t.Fatal(err)
	}
	item := manager.jobs[queued.ID]
	if err := item.root.ClaimPartial(item.local, "local", "", 6); err != nil {
		t.Fatal(err)
	}
	if err := receiveTo(manager.receiverRoot(item), item.local, 0, 3, bytes.NewBufferString("abc")); err != nil {
		t.Fatal(err)
	}
	if err := item.root.SavePartialPrefix(item.local, 3, checksum([]byte("abc"))); err != nil {
		t.Fatal(err)
	}
	if err := manager.Pause(queued.ID); err != nil {
		t.Fatal(err)
	}
	manager.SetDownloadRoot(second)
	resumed, err := manager.Resume(queued.ID)
	if err != nil {
		t.Fatal(err)
	}
	retry := manager.jobs[resumed.ID]
	if retry.root != first || retry.local != "report.pdf" {
		t.Fatal("resume redirected destination")
	}
	retry.view.Size = 6
	if err := manager.prepareReceiver(retry); err != nil {
		t.Fatal(err)
	}
	if retry.view.Offset != 3 {
		t.Fatal("lost resume prefix")
	}
	if err := receiveTo(retry.root, retry.local, 3, 6, bytes.NewBufferString("def")); err != nil {
		t.Fatal(err)
	}
	if err := verifyAndCommit(retry.root, retry.local, checksum([]byte("abcdef"))); err != nil {
		t.Fatal(err)
	}
	assertFile(t, firstDir, "report.pdf", []byte("abcdef"))
	assertMissing(t, roomDir, "report.pdf")
	assertMissing(t, secondDir, "report.pdf")
}

// resumeAfter stops a download with three bytes on disk and returns the next attempt.
func resumeAfter(t *testing.T, checkpoint bool, damage func(path string)) (*Manager, *job) {
	t.Helper()
	manager, dir := idle(t)
	queued, err := manager.Download(t.Context(), "remote", "local")
	if err != nil {
		t.Fatal(err)
	}
	item := manager.jobs[queued.ID]
	item.view.Size, item.hash = 6, checksum([]byte("abcdef"))
	if err := manager.prepareReceiver(item); err != nil {
		t.Fatal(err)
	}
	source := io.TeeReader(bytes.NewBufferString("abc"), item.prefix)
	if err := receiveTo(item.root, "local", 0, 6, source); !errors.Is(err, errDropped) {
		t.Fatalf("expected a drop: %v", err)
	}
	if checkpoint {
		manager.saveCheckpoint(item)
	}
	damage(filepath.Join(dir, "local"+share.PartialSuffix))

	if err := manager.Pause(queued.ID); err != nil {
		t.Fatal(err)
	}
	resumed, err := manager.Resume(queued.ID)
	if err != nil {
		t.Fatal(err)
	}
	next := manager.jobs[resumed.ID]
	next.view.Size, next.hash = 6, item.hash
	return manager, next
}

func TestResumeChecksPartialPrefix(t *testing.T) {
	untouched := func(string) {}
	flip := func(path string) {
		if err := os.WriteFile(path, []byte("abX"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	t.Run("intact partial resumes", func(t *testing.T) {
		manager, next := resumeAfter(t, true, untouched)
		if err := manager.prepareReceiver(next); err != nil || next.view.Offset != 3 {
			t.Fatalf("offset %d, %v", next.view.Offset, err)
		}
	})

	t.Run("flipped byte starts again from zero", func(t *testing.T) {
		manager, next := resumeAfter(t, true, flip)
		if err := manager.prepareReceiver(next); err != nil || next.view.Offset != 0 {
			t.Fatalf("offset %d, %v", next.view.Offset, err)
		}
		if size, _ := next.root.PartialSize("local"); size != 0 {
			t.Fatalf("corrupt partial kept: %d bytes", size)
		}
	})

	t.Run("no checkpoint starts again from zero", func(t *testing.T) {
		manager, next := resumeAfter(t, false, untouched)
		if err := manager.prepareReceiver(next); err != nil || next.view.Offset != 0 {
			t.Fatalf("offset %d, %v", next.view.Offset, err)
		}
	})
}
