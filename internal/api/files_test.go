package api

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Polyphron-AI/tailshare/internal/platform/config"
)

func TestFolderChoice(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	// Nothing chosen yet.
	f.send("GET", "/api/files/local", nil).expect(t, 409, "no_folder")
	f.send("POST", "/api/session/host", nil).expect(t, 409, "no_folder")

	for _, body := range []any{
		map[string]string{"path": "relative/folder"},
		map[string]string{"path": ""},
		map[string]string{},
		"not an object",
	} {
		f.send("PUT", "/api/folder", body).expect(t, 400, "bad_request")
	}

	missing := filepath.Join(t.TempDir(), "nope")
	got := f.send("PUT", "/api/folder", map[string]string{"path": missing})
	got.expect(t, 400, "bad_request")

	if strings.Contains(string(got.Raw), filepath.Base(filepath.Dir(missing))) {
		t.Fatalf("error leaks the local path: %s", got.Raw)
	}

	// A file is not a folder.
	file := filepath.Join(t.TempDir(), "plain.txt")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	f.send("PUT", "/api/folder", map[string]string{"path": file}).expect(t, 400, "bad_request")

	first := f.chooseFolder("one.txt")
	second := f.chooseFolder("two.txt")

	// The second folder replaced the first, and the first is no longer held open.
	list := f.send("GET", "/api/files/local", nil)
	list.expect(t, 200, "")

	if !strings.Contains(string(list.Raw), "two.txt") || strings.Contains(string(list.Raw), "one.txt") {
		t.Fatalf("listing = %s", list.Raw)
	}
	if err := os.RemoveAll(first); err != nil {
		t.Fatalf("the replaced folder is still held open: %v", err)
	}

	// The name shown is the base name, never the path.
	put := f.send("PUT", "/api/folder", map[string]string{"path": second})
	if put.Body["name"] != filepath.Base(second) || strings.Contains(string(put.Raw), `\`) {
		t.Fatalf("put = %s", put.Raw)
	}

	// While a session is open the folder is fixed.
	f.connectPipe()
	f.send("PUT", "/api/folder", map[string]string{"path": second}).expect(t, 409, "conflict")
}

func TestLocalListing(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	f.chooseFolder("a.txt", "b.txt", "c.txt", "d.txt", "e.txt", "sub/inner.txt")

	got := f.send("GET", "/api/files/local?offset=1&limit=2", nil)
	got.expect(t, 200, "")

	entries, _ := got.Body["entries"].([]any)
	if len(entries) != 2 || got.Body["total"] != float64(6) {
		t.Fatalf("page = %s", got.Raw)
	}

	// Folders come first, so offset 1 starts at a.txt.
	if first := entries[0].(map[string]any)["name"]; first != "a.txt" {
		t.Fatalf("first entry = %v", first)
	}

	inner := f.send("GET", "/api/files/local?path=sub", nil)
	inner.expect(t, 200, "")

	if !strings.Contains(string(inner.Raw), "inner.txt") {
		t.Fatalf("sub listing = %s", inner.Raw)
	}

	// Past the end is an empty page, not an error. A huge limit is clamped.
	past := f.send("GET", "/api/files/local?offset=99", nil)
	past.expect(t, 200, "")

	if entries, ok := past.Body["entries"].([]any); !ok || len(entries) != 0 {
		t.Fatalf("past the end = %s", past.Raw)
	}
	f.send("GET", "/api/files/local?limit=999999", nil).expect(t, 200, "")

	for _, query := range []string{"offset=-1", "limit=-5", "offset=x", "limit=1.5"} {
		f.send("GET", "/api/files/local?"+query, nil).expect(t, 400, "bad_request")
	}
}

func TestLocalPathEscapes(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	dir := f.chooseFolder("a.txt")

	bad := []string{"..", "../x", "sub/../..", "/etc", `C:\Windows`, "C:", "a:b", `sub\x`, "CON", "nul.txt", "a//b", "./a"}
	for _, path := range bad {
		got := f.send("GET", "/api/files/local?path="+url.QueryEscape(path), nil)
		got.expect(t, 400, "bad_path")

		if strings.Contains(string(got.Raw), filepath.Base(dir)) {
			t.Errorf("path %q: leaks the local path: %s", path, got.Raw)
		}
	}

	f.send("GET", "/api/files/local?path=missing", nil).expect(t, 404, "not_found")
}

func TestPeerListing(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	f.chooseFolder("mine.txt")

	f.send("GET", "/api/files/peer", nil).expect(t, 409, "not_connected")

	var names []string
	for i := range 5 {
		names = append(names, fmt.Sprintf("remote-%d.txt", i))
	}

	f.connectPipe(names...)

	got := f.send("GET", "/api/files/peer?offset=1&limit=2", nil)
	got.expect(t, 200, "")

	entries, _ := got.Body["entries"].([]any)
	if len(entries) != 2 || got.Body["total"] != float64(5) {
		t.Fatalf("peer page = %s", got.Raw)
	}

	for _, bad := range []string{"..", "../x", "/abs", "C:", "CON"} {
		f.send("GET", "/api/files/peer?path="+url.QueryEscape(bad), nil).expect(t, 400, "bad_path")
	}

	f.send("GET", "/api/files/peer?path=missing", nil).expect(t, 404, "not_found")
	f.send("GET", "/api/files/peer?offset=-1", nil).expect(t, http.StatusBadRequest, "bad_request")
}
