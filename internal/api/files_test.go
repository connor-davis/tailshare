package api

import (
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"testing"

	"github.com/connor-davis/tailshare/internal/platform/config"
)

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
