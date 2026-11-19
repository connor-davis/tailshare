package transfer

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/Polyphron-AI/tailshare/internal/services/peer"
	"github.com/Polyphron-AI/tailshare/internal/services/share"
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
	assertMissing(t, dir, "file"+share.PartialSuffix)
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
