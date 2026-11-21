package share

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestAuditPathLengths(t *testing.T) {
	for _, name := range []string{strings.Repeat("a", 5000), strings.Repeat("a", 256), strings.Repeat("a/", 2048) + "b"} {
		if _, err := Localize(name); !errors.Is(err, ErrBadPath) {
			t.Fatalf("accepted %d-byte path: %v", len(name), err)
		}
	}
}

func TestAuditPruneOldPartials(t *testing.T) {
	rooms := t.TempDir()
	room := filepath.Join(rooms, "ROOM")
	writeFile(t, filepath.Join(room, "nested", "old"+PartialSuffix), "old")
	writeFile(t, filepath.Join(room, "fresh"+PartialSuffix), "fresh")
	writeFile(t, filepath.Join(room, "keep"), "keep")
	before := time.Now().Add(-10 * 24 * time.Hour)
	old := filepath.Join(room, "nested", "old"+PartialSuffix)
	if err := os.Chtimes(old, before, before); err != nil {
		t.Fatal(err)
	}
	root, err := OpenRoom(rooms, "ROOM")
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatalf("old partial remains: %v", err)
	}
	for _, name := range []string{"fresh" + PartialSuffix, "keep"} {
		if _, err := os.Stat(filepath.Join(room, name)); err != nil {
			t.Fatal(err)
		}
	}
}

func TestAuditCommitWithoutHardLinks(t *testing.T) {
	root, inside, _ := openShared(t)
	writeFile(t, filepath.Join(inside, "file"+PartialSuffix), "verified")
	root.link = func(string, string) error { return errors.New("hard links unsupported") }
	if err := root.Commit("file"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(inside, "file"))
	if err != nil || string(data) != "verified" {
		t.Fatalf("fallback lost data: %q %v", data, err)
	}
	writeFile(t, filepath.Join(inside, "file"+PartialSuffix), "second")
	if err := root.Commit("file"); !errors.Is(err, ErrExists) {
		t.Fatalf("overwrote file: %v", err)
	}
}

func TestAuditShortAliasRefused(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows short aliases")
	}
	root, inside, _ := openShared(t)
	writeFile(t, filepath.Join(inside, "movie.mkv"+PartialSuffix), "private")
	for _, name := range []string{"MOVIEM~1.TAI", "folder~1/movie", "MOVIEM~2.TAI"} {
		if _, err := root.OpenRead(name); !errors.Is(err, ErrBadPath) {
			t.Fatalf("alias accepted: %v", err)
		}
	}

	// Long names that only contain "~<digit>" are ordinary files.
	for _, name := range []string{"report~2024.pdf", "notes ~1 final.txt"} {
		if _, err := Localize(name); err != nil {
			t.Fatalf("%s refused: %v", name, err)
		}
	}
}

func TestAuditPartialIdentity(t *testing.T) {
	root, inside, _ := openShared(t)
	if err := root.ClaimPartial("file", "A", "hash-a", 3); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(inside, "file"+PartialSuffix), "abc")
	for _, identity := range []partialIdentity{{Owner: "B", Hash: "hash-a", Size: 3}, {Owner: "A", Hash: "hash-b", Size: 3}, {Owner: "A", Hash: "hash-a", Size: 2}} {
		if err := root.ClaimPartial("file", identity.Owner, identity.Hash, identity.Size); err == nil {
			t.Fatal("foreign partial claimed")
		}
	}
	if err := root.ClaimPartial("file", "A", "hash-a", 3); err != nil {
		t.Fatal(err)
	}
}

func TestAuditListingReadOnce(t *testing.T) {
	root, inside, _ := openShared(t)
	writeFile(t, filepath.Join(inside, "file"), "data")
	reads := 0
	root.readDirectory = func(file *os.File) ([]string, error) { reads++; return file.Readdirnames(-1) }
	for range 100 {
		entries, total, err := root.List("", 0, 10)
		if err != nil || total != 1 || len(entries) != 1 {
			t.Fatalf("list: %v %d %v", entries, total, err)
		}
		entries[0].Name = "mutated"
	}
	if reads != 1 {
		t.Fatalf("directory read %d times", reads)
	}
}

func TestAuditPartialQuota(t *testing.T) {
	root, _, _ := openShared(t)
	if err := root.ClaimPartial("large", "owner", "hash", 1<<40); err != nil {
		t.Fatal(err)
	}
	if err := root.ClaimPartial("other", "owner", "hash", 1); err == nil {
		t.Fatal("room reservation quota exceeded")
	}
	if err := root.RemovePartial("large"); err != nil {
		t.Fatal(err)
	}
	for i := range 199 {
		if err := root.ClaimPartial(fmt.Sprintf("file%d", i), "owner", "hash", 0); err != nil {
			t.Fatal(err)
		}
	}
	if err := root.ClaimPartial("extra", "owner", "hash", 0); err == nil {
		t.Fatal("room count quota exceeded")
	}
}
