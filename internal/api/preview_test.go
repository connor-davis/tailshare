package api

import (
	"bytes"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/connor-davis/tailshare/internal/platform/config"
)

// pngHead is the start of a real PNG, enough for content sniffing.
var pngHead = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00")

func previewPath(name string) string {
	return "/api/room/preview?path=" + url.QueryEscape(name)
}

func TestRoomPreviewKinds(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	dir := f.chooseFolder()
	write := func(name string, data []byte) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("pic.png", pngHead)
	write("note.txt", []byte("hello world\n"))
	write("long.txt", []byte(strings.Repeat("é", 2000)))
	write("big.png", append(append([]byte{}, pngHead...), make([]byte, maxPreviewImage)...))
	write("logo.svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>`))
	write("sneaky.txt", []byte(`<svg onload="x()"></svg>`))
	write("page.html", []byte("<html><body>hi</body></html>"))
	write("data.bin", []byte{0, 1, 2, 3, 4, 5})

	image := f.send("GET", previewPath("pic.png"), nil)
	image.expect(t, 200, "")
	if image.Body["kind"] != "image" || image.Body["mime"] != "image/png" || image.Body["data"] == "" {
		t.Fatal(string(image.Raw))
	}

	text := f.send("GET", previewPath("note.txt"), nil)
	text.expect(t, 200, "")
	if text.Body["kind"] != "text" || text.Body["text"] != "hello world\n" || text.Body["cut"] != nil {
		t.Fatal(string(text.Raw))
	}

	long := f.send("GET", previewPath("long.txt"), nil)
	long.expect(t, 200, "")
	got, _ := long.Body["text"].(string)
	if long.Body["kind"] != "text" || long.Body["cut"] != true || len(got) > maxPreviewText ||
		strings.Contains(got, "\ufffd") {
		t.Fatalf("kind %v cut %v len %d", long.Body["kind"], long.Body["cut"], len(got))
	}

	for _, name := range []string{"big.png", "logo.svg", "sneaky.txt", "page.html", "data.bin"} {
		reply := f.send("GET", previewPath(name), nil)
		reply.expect(t, 200, "")
		if reply.Body["kind"] != "none" || bytes.Contains(reply.Raw, []byte("script")) {
			t.Fatalf("%s: %s", name, reply.Raw)
		}
	}
}

func TestRoomPreviewRefusesEscapes(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	dir := f.chooseFolder("inside.txt")
	outside := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(outside, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}

	for _, wire := range []string{
		"../secret.txt", "a/../../secret.txt", "..", "/secret.txt", "C:/secret.txt",
		"C:\\secret.txt", outside, "inside.txt:stream", "",
	} {
		reply := f.send("GET", previewPath(wire), nil)
		if reply.Status < 400 || strings.Contains(string(reply.Raw), "secret") {
			t.Fatalf("%q: %d %s", wire, reply.Status, reply.Raw)
		}
	}

	// A folder is not a file.
	if err := os.Mkdir(filepath.Join(dir, "folder"), 0o755); err != nil {
		t.Fatal(err)
	}
	f.send("GET", previewPath("folder"), nil).expect(t, 400, "not_file")
	f.send("GET", previewPath("missing.txt"), nil).expect(t, 404, "")

	// A link that points out of the room must not be followed.
	link := filepath.Join(dir, "link.txt")
	if os.Symlink(outside, link) != nil {
		t.Skip("this machine cannot make links")
	}
	reply := f.send("GET", previewPath("link.txt"), nil)
	if reply.Status < 400 || strings.Contains(string(reply.Raw), "secret") {
		t.Fatalf("followed a link: %d %s", reply.Status, reply.Raw)
	}
}

func TestRoomPreviewNeedsARoomAndAToken(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	f.send("GET", previewPath("a.txt"), nil).expect(t, 409, "not_connected")
	f.send("GET", previewPath("a.txt"), nil, func(request *http.Request) {
		request.Header.Del("Authorization")
	}).expect(t, 401, "unauthorized")
}

func TestDownloadPreviewIsMainOnlyAndChecksTheFolder(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	saved := t.TempDir()
	if err := os.WriteFile(filepath.Join(saved, "note.txt"), []byte("saved text"), 0o600); err != nil {
		t.Fatal(err)
	}
	body := func(folder, name string) map[string]string {
		return map[string]string{"folder": folder, "name": name}
	}

	f.send("POST", "/api/downloads/preview", body(saved, "note.txt")).expect(t, 403, "forbidden")

	ok := f.send("POST", "/api/downloads/preview", body(saved, "note.txt"), mainHeader)
	ok.expect(t, 200, "")
	if ok.Body["kind"] != "text" || ok.Body["text"] != "saved text" {
		t.Fatal(string(ok.Raw))
	}

	for _, bad := range []map[string]string{
		body(saved, "../note.txt"), body(saved, "sub/note.txt"), body(saved, `sub\note.txt`),
		body("relative", "note.txt"), body(saved+string(filepath.Separator)+"..", "note.txt"),
		body(filepath.Join(saved, "note.txt"), "note.txt"), body(saved, ""),
	} {
		f.send("POST", "/api/downloads/preview", bad, mainHeader).expect(t, 400, "")
	}
}
