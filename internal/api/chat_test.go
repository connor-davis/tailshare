package api

import (
	"strings"
	"testing"

	"github.com/Polyphron-AI/tailshare/internal/platform/config"
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
	local := f.server.peer
	f.server.mu.Unlock()
	<-local.Done()

	f.send("POST", "/api/chat", map[string]string{"text": "anyone?"}).expect(t, 502, "unavailable")
}
