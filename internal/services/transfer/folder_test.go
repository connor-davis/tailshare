package transfer

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/connor-davis/tailshare/internal/services/share"
)

func TestFolderDownloadsReserveAndPinRoot(t *testing.T) {
	root, err := share.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	defer root.Close()

	directory := t.TempDir()
	into, err := share.Open(directory)
	if err != nil {
		t.Fatal(err)
	}

	defer into.Close()

	manager := New(root)
	defer manager.Close()

	for _, expected := range []string{"Tree/nested/file.txt", "Tree (2)/nested/file.txt"} {
		items, err := manager.DownloadTree(context.Background(), "Tree", []TreeFile{
			{Remote: "Tree/nested/file.txt", Relative: "nested/file.txt"},
		}, into)
		if err != nil || len(items) != 1 || items[0].LocalPath != expected {
			t.Fatalf("%+v %v", items, err)
		}

		if _, err := os.Stat(filepath.Dir(filepath.Join(directory, filepath.FromSlash(expected)))); err != nil {
			t.Fatal(err)
		}
	}

	if !manager.PinsRoot(into) {
		t.Fatal("queued folder did not pin its root")
	}

	for _, name := range []string{"../escape", "/absolute", "C:/outside", "CON", `\\server\share`} {
		if _, err := manager.DownloadTree(context.Background(), "Tree", []TreeFile{
			{Remote: "file.txt", Relative: name},
		}, into); err == nil {
			t.Fatalf("accepted %q", name)
		}
	}

	if _, err := manager.DownloadInto(context.Background(), "file.txt", "sub/file.txt", into); err == nil {
		t.Fatal("single-file guard was weakened")
	}
}
