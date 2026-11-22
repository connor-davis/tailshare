package api

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/connor-davis/tailshare/internal/platform/config"
)

func TestChatRoutes(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	f.chooseFolder()

	f.send("GET", "/api/chat", nil).expect(t, 409, "not_connected")
	f.send("POST", "/api/chat", map[string]string{"text": "hi"}).expect(t, 409, "not_connected")

	remote := f.connectPipe()

	sent := f.send("POST", "/api/chat", map[string]string{"text": "hello there"})
	sent.expect(t, 201, "")

	if sent.Body["text"] != "hello there" || sent.Body["fromPeer"] != false {
		t.Fatalf("sent = %s", sent.Raw)
	}

	if _, err := remote.SendChat(t.Context(), "hello back"); err != nil {
		t.Fatal(err)
	}

	log := f.send("GET", "/api/chat", nil)
	log.expect(t, 200, "")

	items, _ := log.Body["items"].([]any)
	if len(items) != 2 || items[1].(map[string]any)["fromPeer"] != true {
		t.Fatalf("log = %s", log.Raw)
	}

	// A bad message is the writer's mistake and says so in a plain sentence.
	f.send("POST", "/api/chat", map[string]string{"text": "   "}).expect(t, 400, "bad_request")
	f.send("POST", "/api/chat", map[string]string{"text": strings.Repeat("x", 9000)}).expect(t, 400, "bad_request")
	f.send("POST", "/api/chat", "not an object").expect(t, 400, "bad_request")

	// A lost connection is not the writer's mistake.
	_ = remote.Close()

	f.server.mu.Lock()
	local := f.server.activeLocked().peer
	f.server.mu.Unlock()
	<-local.Done()

	f.send("POST", "/api/chat", map[string]string{"text": "anyone?"}).expect(t, 502, "unavailable")
}

func TestChatAttachments(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	f.chooseFolder("report.pdf")
	f.connectPipe()
	result := f.send("POST", "/api/chat", map[string]any{"text": "", "attachment": map[string]any{"path": "report.pdf", "name": "spoof", "size": 99}})
	result.expect(t, 201, "")
	attachment := result.Body["attachment"].(map[string]any)
	if attachment["name"] != "report.pdf" || attachment["size"] != float64(len("report.pdf")) {
		t.Fatal(string(result.Raw))
	}
	for _, path := range []string{"../escape", "/absolute", `C:\secret`, "a:b", ""} {
		f.send("POST", "/api/chat", map[string]any{"attachment": map[string]string{"path": path}}).expect(t, 400, "bad_path")
	}
	f.send("POST", "/api/chat", map[string]any{"attachment": map[string]string{"path": "missing"}}).expect(t, 404, "not_found")
}

func TestChatFolderAttachmentUsesImportedSummary(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	f.chooseFolder()
	f.connectPipe()
	source := filepath.Join(t.TempDir(), "Album")
	if err := os.MkdirAll(filepath.Join(source, "sub"), 0o700); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(source, "sub", "note.txt"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}

	added := f.send("POST", "/api/room/files", map[string]any{"paths": []string{source}}, mainHeader)
	added.expect(t, 200, "")
	entry := added.Body["added"].([]any)[0].(map[string]any)
	if entry["folder"] != true || entry["count"] != float64(1) || entry["size"] != float64(5) {
		t.Fatal(string(added.Raw))
	}

	result := f.send("POST", "/api/chat", map[string]any{"attachment": map[string]any{"path": "Album", "folder": false, "size": 999, "count": 999}})
	result.expect(t, 201, "")
	attachment := result.Body["attachment"].(map[string]any)
	if attachment["folder"] != true || attachment["count"] != float64(1) || attachment["size"] != float64(5) {
		t.Fatal(string(result.Raw))
	}
}
