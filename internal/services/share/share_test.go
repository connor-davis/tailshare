package share

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func writeFile(t *testing.T, path, text string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

// openShared makes <tmp>/inside as the shared folder next to <tmp>/outside,
// which holds a secret the shared folder must never reveal or change.
func openShared(t *testing.T) (shared *Root, inside, outside string) {
	t.Helper()

	base := t.TempDir()
	inside = filepath.Join(base, "inside")
	outside = filepath.Join(base, "outside")
	writeFile(t, filepath.Join(outside, "secret.txt"), "secret")

	if err := os.MkdirAll(inside, 0o755); err != nil {
		t.Fatal(err)
	}

	shared, err := Open(inside)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = shared.Close() })

	return shared, inside, outside
}

func TestListAndStat(t *testing.T) {
	shared, inside, _ := openShared(t)
	writeFile(t, filepath.Join(inside, "b.txt"), "bb")
	writeFile(t, filepath.Join(inside, "A.txt"), "a")
	writeFile(t, filepath.Join(inside, "zdir", "deep.txt"), "deep")
	writeFile(t, filepath.Join(inside, "adir", "x.txt"), "x")

	entries, total, err := shared.List("", 0, 0)
	if err != nil {
		t.Fatal(err)
	}

	order := ""
	for _, entry := range entries {
		order += entry.Name + " "
	}
	if total != 4 || order != "adir zdir A.txt b.txt " {
		t.Fatalf("listing = %q (total %d), want folders first then names without case", order, total)
	}
	if entries[3].Size != 2 || entries[3].IsDir || entries[3].ModTime.Location() != entries[3].ModTime.UTC().Location() {
		t.Fatalf("bad metadata: %+v", entries[3])
	}

	nested, _, err := shared.List("zdir", 0, 0)
	if err != nil || len(nested) != 1 || nested[0].Name != "deep.txt" {
		t.Fatalf("nested listing = %+v, %v", nested, err)
	}

	file, err := shared.Stat("zdir/deep.txt")
	if err != nil || file.Name != "deep.txt" || file.Size != 4 || file.IsDir {
		t.Fatalf("stat file = %+v, %v", file, err)
	}

	folder, err := shared.Stat("zdir")
	if err != nil || !folder.IsDir {
		t.Fatalf("stat folder = %+v, %v", folder, err)
	}

	if _, err := shared.Stat("nope.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("stat missing: %v", err)
	}
	if _, _, err := shared.List("nope", 0, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("list missing: %v", err)
	}
}

func TestListPaging(t *testing.T) {
	shared, inside, _ := openShared(t)
	for i := range 5 {
		writeFile(t, filepath.Join(inside, fmt.Sprintf("f%d.txt", i)), "x")
	}

	page, total, err := shared.List("", 3, 10)
	if err != nil || total != 5 || len(page) != 2 || page[0].Name != "f3.txt" {
		t.Fatalf("page = %+v total %d err %v", page, total, err)
	}

	page, _, err = shared.List("", 1, 2)
	if err != nil || len(page) != 2 || page[0].Name != "f1.txt" {
		t.Fatalf("page = %+v err %v", page, err)
	}

	page, _, err = shared.List("", 99, 2)
	if err != nil || len(page) != 0 {
		t.Fatalf("past the end = %+v err %v", page, err)
	}
}

func TestOpenReadAndCreate(t *testing.T) {
	shared, inside, _ := openShared(t)
	writeFile(t, filepath.Join(inside, "d", "hello.txt"), "hello")

	file, err := shared.OpenRead("d/hello.txt")
	if err != nil {
		t.Fatal(err)
	}
	text, _ := io.ReadAll(file)
	_ = file.Close()
	if string(text) != "hello" {
		t.Fatalf("read %q", text)
	}

	if _, err := shared.OpenRead("d"); !errors.Is(err, ErrNotFile) {
		t.Fatalf("OpenRead of a folder: %v", err)
	}

	created, err := shared.Create("d/new.txt")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = created.WriteString("new")
	_ = created.Close()

	if _, err := shared.Create("d/new.txt"); !errors.Is(err, ErrExists) {
		t.Fatalf("second Create should not overwrite: %v", err)
	}
	if _, err := shared.Create("d/hello.txt"); !errors.Is(err, ErrExists) {
		t.Fatalf("Create over an existing file: %v", err)
	}
	if _, err := shared.Create("missing/new.txt"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Create in a missing folder: %v", err)
	}
	if _, err := shared.Create(""); !errors.Is(err, ErrBadPath) {
		t.Fatalf("Create of the root: %v", err)
	}
}

func TestEscapesAreRefused(t *testing.T) {
	shared, _, outside := openShared(t)

	for _, wire := range []string{"../outside/secret.txt", "a/../../outside/secret.txt", outside, "C:\\x"} {
		if _, err := shared.Stat(wire); !errors.Is(err, ErrBadPath) {
			t.Errorf("Stat(%q): %v", wire, err)
		}
		if _, _, err := shared.List(wire, 0, 0); !errors.Is(err, ErrBadPath) {
			t.Errorf("List(%q): %v", wire, err)
		}
		if _, err := shared.OpenRead(wire); !errors.Is(err, ErrBadPath) {
			t.Errorf("OpenRead(%q): %v", wire, err)
		}
		if _, err := shared.Create(wire); !errors.Is(err, ErrBadPath) {
			t.Errorf("Create(%q): %v", wire, err)
		}
	}

	assertOutsideUntouched(t, outside)
}

// linkMakers builds a link at link that points to target. A maker returns a
// reason to skip when this machine does not allow that kind of link.
var linkMakers = map[string]func(target, link string) (skip string){
	"symlink": func(target, link string) string {
		if err := os.Symlink(target, link); err != nil {
			return "symlinks are not allowed here: " + err.Error()
		}

		return ""
	},
	"junction": func(target, link string) string {
		if runtime.GOOS != "windows" {
			return "junctions exist only on Windows"
		}
		if out, err := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput(); err != nil {
			return "junctions are not allowed here: " + string(out)
		}

		return ""
	},
}

func TestLinksCannotEscape(t *testing.T) {
	for kind, makeLink := range linkMakers {
		t.Run(kind, func(t *testing.T) {
			shared, inside, outside := openShared(t)
			if reason := makeLink(outside, filepath.Join(inside, "out")); reason != "" {
				t.Skip(reason)
			}

			// Through the link, as a folder and as a path prefix.
			if _, err := shared.Stat("out/secret.txt"); err == nil {
				t.Error("Stat followed a link out of the folder")
			}
			if _, _, err := shared.List("out", 0, 0); err == nil {
				t.Error("List followed a link out of the folder")
			}
			if file, err := shared.OpenRead("out/secret.txt"); err == nil {
				_ = file.Close()
				t.Error("OpenRead followed a link out of the folder")
			}
			if file, err := shared.Create("out/planted.txt"); err == nil {
				_ = file.Close()
				t.Error("Create followed a link out of the folder")
			}

			// The link itself must not show up as a way out.
			entries, _, err := shared.List("", 0, 0)
			if err != nil {
				t.Fatal(err)
			}
			for _, entry := range entries {
				if entry.Name == "out" {
					t.Error("an escaping link was listed")
				}
			}

			assertOutsideUntouched(t, outside)
		})
	}
}

func TestLinksInsideAreAllowed(t *testing.T) {
	shared, inside, _ := openShared(t)
	writeFile(t, filepath.Join(inside, "real", "a.txt"), "a")

	// A relative target: os.Root refuses absolute link targets, which is safe.
	if reason := linkMakers["symlink"]("real", filepath.Join(inside, "alias")); reason != "" {
		t.Skip(reason)
	}

	if _, err := shared.Stat("alias/a.txt"); err != nil {
		t.Fatalf("a link that stays inside should work: %v", err)
	}
}

func assertOutsideUntouched(t *testing.T, outside string) {
	t.Helper()

	names, err := os.ReadDir(outside)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 1 || names[0].Name() != "secret.txt" {
		t.Fatalf("something changed outside the shared folder: %v", names)
	}

	text, _ := os.ReadFile(filepath.Join(outside, "secret.txt"))
	if string(text) != "secret" {
		t.Fatalf("outside file was changed: %q", text)
	}
}

func TestImportSkipsLinksAndJunctions(t *testing.T) {
	for kind, makeLink := range linkMakers {
		t.Run(kind, func(t *testing.T) {
			shared, inside, outside := openShared(t)
			linked := filepath.Join(inside, "alias")
			if reason := makeLink(outside, linked); reason != "" {
				t.Skip(reason)
			}
			for _, source := range []string{linked, filepath.Join(linked, "secret.txt")} {
				if _, err := shared.Import(source); err == nil {
					t.Fatalf("imported %s", source)
				}
			}
			assertOutsideUntouched(t, outside)
		})
	}
}

func TestRoomRootCannotFollowEscapingLink(t *testing.T) {
	for kind, makeLink := range linkMakers {
		t.Run(kind, func(t *testing.T) {
			rooms, outside := t.TempDir(), t.TempDir()
			if reason := makeLink(outside, filepath.Join(rooms, "7K3Q-9PXM")); reason != "" {
				t.Skip(reason)
			}
			if root, err := OpenRoom(rooms, "7K3Q-9PXM"); err == nil {
				root.Close()
				t.Fatal("opened outside rooms")
			}
		})
	}
}
