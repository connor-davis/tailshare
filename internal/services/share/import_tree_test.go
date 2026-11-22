package share

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestImportTreePreservesFilesAndCounts(t *testing.T) {
	shared, inside, _ := openShared(t)
	source := filepath.Join(t.TempDir(), "Photos")
	writeFile(t, filepath.Join(source, "one.txt"), "abc")
	writeFile(t, filepath.Join(source, "nested", "two.txt"), "de")
	if err := os.Mkdir(filepath.Join(source, "empty"), 0o700); err != nil {
		t.Fatal(err)
	}

	for _, name := range []string{"Photos", "Photos (2)"} {
		added, err := shared.ImportTree(source)
		if err != nil || added.Name != name || added.Count != 2 || added.Size != 5 || !added.Folder {
			t.Fatalf("%+v %v", added, err)
		}

		if got, err := os.ReadFile(filepath.Join(inside, name, "nested", "two.txt")); err != nil || string(got) != "de" {
			t.Fatalf("%q %v", got, err)
		}

		if _, err := os.Stat(filepath.Join(inside, name, "empty")); !os.IsNotExist(err) {
			t.Fatal("empty folder was copied")
		}

		if summary, ok := shared.TreeSummary(name); !ok || summary != added {
			t.Fatalf("summary = %+v %v", summary, ok)
		}
	}
}

func TestImportTreeRefusesLinksAndJunctions(t *testing.T) {
	for kind, makeLink := range linkMakers {
		t.Run(kind, func(t *testing.T) {
			shared, inside, outside := openShared(t)
			source := filepath.Join(t.TempDir(), "Tree")
			writeFile(t, filepath.Join(source, "normal.txt"), "safe")
			if reason := makeLink(outside, filepath.Join(source, "escape")); reason != "" {
				t.Skip(reason)
			}

			if _, err := shared.ImportTree(source); err == nil {
				t.Fatal("imported a tree containing a link")
			}

			if entries, _ := os.ReadDir(inside); len(entries) != 0 {
				t.Fatal("failed import left files behind")
			}

			if _, err := shared.ImportTree(filepath.Join(source, "escape")); err == nil {
				t.Fatal("imported a linked source")
			}

			assertOutsideUntouched(t, outside)
		})
	}
}

func TestImportTreeLimitsAndBadSources(t *testing.T) {
	for _, test := range []struct {
		name         string
		files, depth int
	}{
		{"file count", MaxTreeFiles + 1, 0},
		{"depth", 1, MaxTreeDepth + 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			shared, inside, _ := openShared(t)
			source := filepath.Join(t.TempDir(), "Tree")
			folder := source
			for range test.depth {
				folder = filepath.Join(folder, "d")
			}

			for number := range test.files {
				writeFile(t, filepath.Join(folder, fmt.Sprintf("f%d", number)), "")
			}

			if _, err := shared.ImportTree(source); !errors.Is(err, ErrTreeLimit) {
				t.Fatalf("limit: %v", err)
			}

			if entries, _ := os.ReadDir(inside); len(entries) != 0 {
				t.Fatal("failed tree remained visible")
			}
		})
	}

	shared, _, _ := openShared(t)
	for _, source := range []string{"", "../outside", "relative", filepath.Join(t.TempDir(), "missing"), shared.root.Name(), filepath.Dir(shared.root.Name())} {
		if _, err := shared.ImportTree(source); err == nil {
			t.Fatalf("accepted %q", source)
		}
	}
}

func TestMakeDirsCannotEscape(t *testing.T) {
	shared, _, outside := openShared(t)
	for _, name := range []string{"../outside/new", "/absolute", "C:/outside", `\\server\share`, "CON/child"} {
		if err := shared.MakeDirs(name); err == nil {
			t.Fatalf("accepted %q", name)
		}
	}

	assertOutsideUntouched(t, outside)
}
