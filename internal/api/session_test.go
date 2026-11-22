package api

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

func TestSessionBadRequests(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	// Idle: nothing to leave, nothing to read.
	f.send("GET", "/api/session", nil).expect(t, 200, "")
	f.send("DELETE", "/api/session", nil).expect(t, 200, "")

	// A bad code is refused before any network work, even without a folder.
	for _, code := range []string{"", "nope", "7K3-Q9", "7K3-Q9P", "7K3Q-9PXMX", "!!!!!!"} {
		f.send("POST", "/api/session/join", map[string]string{"code": code}).expect(t, 400, "bad_request")
	}
	f.send("POST", "/api/session/join", "not an object").expect(t, 400, "bad_request")

	// An unconfigured rooms directory fails before networking.
	f.server.cfg.RoomsDir = ""
	f.send("POST", "/api/session/join", map[string]string{"code": "7K3Q-9PXM"}).expect(t, 400, "bad_request")

	// A failed start leaves the session idle, so it can be tried again.
	if got := f.send("GET", "/api/session", nil); got.Body["state"] != phaseIdle {
		t.Fatalf("session = %s", got.Raw)
	}
}

// TestSessionLifecycle runs two APIs against a local relay: host, join, the
// duplicate-code rule, files, chat, events, leaving, and the host noticing.
func TestSessionLifecycle(t *testing.T) {
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}

	host := newFixture(t, cfg, nil)
	join := newFixture(t, cfg, nil)

	hostLive := host.dialLive()
	next(t, hostLive)

	hosting := host.send("POST", "/api/session/host", map[string]string{
		"displayName": "Hana", "roomName": "  Movie night  ",
	})
	hosting.expect(t, 201, "")

	if hosting.Body["roomName"] != "Movie night" {
		t.Fatalf("host room = %s", hosting.Raw)
	}

	code, _ := hosting.Body["code"].(string)
	if err := os.WriteFile(filepath.Join(host.server.cfg.RoomsDir, code, "from-host.txt"), []byte("host"), 0o600); err != nil {
		t.Fatal(err)
	}
	joinDir := filepath.Join(join.server.cfg.RoomsDir, code)
	if err := os.MkdirAll(filepath.Join(joinDir, "docs"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(joinDir, "docs", "from-joiner.txt"), []byte("joiner"), 0o600); err != nil {
		t.Fatal(err)
	}
	if hosting.Body["state"] != phaseHosting || hosting.Body["role"] != roleHost || len(code) != 9 {
		t.Fatalf("host = %s", hosting.Raw)
	}

	// The same code cannot be opened twice, and the folder is fixed.
	host.send("POST", "/api/session/host", map[string]string{"code": code}).expect(t, 409, "conflict")
	host.send("POST", "/api/session/join", map[string]string{"code": code}).expect(t, 409, "conflict")
	host.send("PUT", "/api/folder", map[string]string{"path": t.TempDir()}).expect(t, 404, "not_found")

	until(t, hostLive, "session.state", func(e Event) bool {
		return strings.Contains(string(mustJSON(e.Data)), `"state":"hosting"`)
	})

	// The code is shown only while hosting.
	joined := joinWithApproval(t, host, join, code)
	joined.expect(t, 200, "")

	if joined.Body["state"] != phaseConnected || joined.Body["role"] != roleJoiner || joined.Body["code"] != nil {
		t.Fatalf("join = %s", joined.Raw)
	}

	// Both sides list the host first, and each marks itself.
	for name, f := range map[string]*fixture{"host": host, "joiner": join} {
		var state SessionState
		if err := json.Unmarshal(f.send("GET", "/api/session", nil).Raw, &state); err != nil {
			t.Fatal(err)
		}
		if len(state.Members) != 2 || !state.Members[0].Host || state.Members[1].Host {
			t.Fatalf("%s members = %+v", name, state.Members)
		}
		if state.Members[0].You != (name == "host") || state.Members[1].You != (name == "joiner") {
			t.Fatalf("%s you flags = %+v", name, state.Members)
		}
	}

	join.send("POST", "/api/session/join", map[string]string{"code": code}).expect(t, 409, "conflict")

	until(t, hostLive, "session.state", func(e Event) bool {
		return strings.Contains(string(mustJSON(e.Data)), `"state":"connected"`)
	})

	hostState := host.send("GET", "/api/session", nil)
	if hostState.Body["code"] != nil || hostState.Body["peer"] == nil {
		t.Fatalf("host state = %s", hostState.Raw)
	}

	// Both sides show the host's name for the room.
	if hostState.Body["roomName"] != "Movie night" || joined.Body["roomName"] != "Movie night" {
		t.Fatalf("room names = %s / %s", hostState.Raw, joined.Raw)
	}

	// Each side lists the other's folder.
	if got := host.send("GET", "/api/files/peer?path=docs", nil); !strings.Contains(string(got.Raw), "from-joiner.txt") {
		t.Fatalf("host sees %s", got.Raw)
	}
	if got := join.send("GET", "/api/files/peer", nil); !strings.Contains(string(got.Raw), "from-host.txt") {
		t.Fatalf("joiner sees %s", got.Raw)
	}

	// Chat reaches the other side's log and its live socket.
	join.send("POST", "/api/chat", map[string]string{"text": "hi host"}).expect(t, 201, "")

	chat := until(t, hostLive, "chat.message", nil)
	if !strings.Contains(string(mustJSON(chat.Data)), "hi host") {
		t.Fatalf("chat event = %+v", chat)
	}

	if got := host.send("GET", "/api/chat", nil); !strings.Contains(string(got.Raw), "hi host") {
		t.Fatalf("host chat log = %s", got.Raw)
	}

	hostRoot, joinRoot := host.server.activeLocked().root, join.server.activeLocked().root

	// Leaving ends both sides: the joiner at once, the host when it notices.
	join.send("DELETE", "/api/session", nil).expect(t, 200, "")

	if got := join.send("GET", "/api/session", nil); got.Body["state"] != phaseIdle {
		t.Fatalf("joiner after leaving = %s", got.Raw)
	}

	until(t, hostLive, "session.state", func(e Event) bool {
		return strings.Contains(string(mustJSON(e.Data)), `"state":"idle"`)
	})

	// Handles close after leave, but persisted room files remain available for reuse.
	for _, root := range []*share.Root{hostRoot, joinRoot} {
		if _, err := root.Stat(""); err == nil {
			t.Fatal("leave retained an open root")
		}
	}
	if _, err := os.Stat(filepath.Join(host.server.cfg.RoomsDir, code, "from-host.txt")); err != nil {
		t.Fatal(err)
	}

	// Chat needs a connection again.
	host.send("GET", "/api/files/local", nil).expect(t, 409, "not_connected")
	host.send("GET", "/api/chat", nil).expect(t, 409, "not_connected")
	host.send("DELETE", "/api/session", nil).expect(t, 200, "")
}

func joinWithApproval(t *testing.T, host, join *fixture, code string) reply {
	t.Helper()
	live := host.dialLive()
	defer live.Close()
	next(t, live)
	result := make(chan reply, 1)
	go func() {
		result <- join.send("POST", "/api/session/join", map[string]string{"code": code})
	}()
	event := until(t, live, "session.state", func(event Event) bool {
		var state SessionState
		_ = json.Unmarshal(mustJSON(event.Data), &state)
		return state.Join != nil
	})
	var state SessionState
	if err := json.Unmarshal(mustJSON(event.Data), &state); err != nil {
		t.Fatal(err)
	}
	host.send("POST", fmt.Sprintf("/api/session/joins/%d/allow", state.Join.ID), nil).expect(t, 200, "")
	joined := <-result
	until(t, live, "session.state", func(event Event) bool {
		var state SessionState
		_ = json.Unmarshal(mustJSON(event.Data), &state)
		return state.State == phaseConnected && state.Join == nil
	})
	return joined
}

func TestAllowDenyRoutes(t *testing.T) {
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}
	host, join := newFixture(t, cfg, nil), newFixture(t, cfg, nil)
	for _, id := range []string{"0", "-1", "nope", "01", "18446744073709551616"} {
		host.send("POST", "/api/session/joins/"+id+"/allow", nil).expect(t, 400, "bad_request")
	}
	host.send("POST", "/api/session/joins/1/deny", nil).expect(t, 409, "conflict")
	hosted := host.send("POST", "/api/session/host", nil)
	hosted.expect(t, 201, "")
	live := host.dialLive()
	defer live.Close()
	next(t, live)
	results := make(chan reply, 1)
	go func() {
		results <- join.send(
			"POST",
			"/api/session/join",
			map[string]any{"code": hosted.Body["code"]},
		)
	}()
	event := until(t, live, "session.state", func(event Event) bool {
		var state SessionState
		_ = json.Unmarshal(mustJSON(event.Data), &state)
		return state.Join != nil
	})
	var state SessionState
	if err := json.Unmarshal(mustJSON(event.Data), &state); err != nil {
		t.Fatal(err)
	}
	if state.Join.DisplayName == "" {
		t.Fatal("prompt name missing")
	}
	host.send(
		"POST",
		fmt.Sprintf("/api/session/joins/%d/allow", state.Join.ID+1),
		nil,
	).expect(t, 404, "not_found")
	denied := host.send("POST", fmt.Sprintf("/api/session/joins/%d/deny", state.Join.ID), nil)
	denied.expect(t, 200, "")
	if denied.Body["join"] != nil {
		t.Fatal("deny retained prompt")
	}
	(<-results).expect(t, 403, "join_denied")
	if join.server.activeLocked() != nil {
		t.Fatal("failed join retained its room resources")
	}
	host.send("POST", fmt.Sprintf("/api/session/joins/%d/allow", state.Join.ID), nil).expect(t, 409, "conflict")
}

func TestDisplayNamePrefersTheChosenName(t *testing.T) {
	if got := displayName("  Sam  "); got != "Sam" {
		t.Fatalf("chosen name: got %q", got)
	}

	fallback := displayName("")
	for _, bad := range []string{"   ", "a\nb", strings.Repeat("x", 65), "\xff"} {
		if got := displayName(bad); got != fallback {
			t.Fatalf("displayName(%q) = %q, want the computer name %q", bad, got, fallback)
		}
	}
}

func TestRoomNameDefaults(t *testing.T) {
	long := strings.Repeat("h", 64)

	cases := []struct{ chosen, host, want string }{
		{"", "Hana", "Hana's room"},
		{"   ", "Hana", "Hana's room"},
		{"bad\nname", "Hana", "Hana's room"},
		{strings.Repeat("r", 65), "Hana", "Hana's room"},
		{"Movie night", "Hana", "Movie night"},
		{"", long, (long + "'s room")[:64]},
	}
	for _, c := range cases {
		if got := roomName(c.chosen, c.host); got != c.want {
			t.Errorf("roomName(%q, %q) = %q, want %q", c.chosen, c.host, got, c.want)
		}
	}
}

func TestHostReopensSameCodeWithFreshExpiry(t *testing.T) {
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	f := newFixture(t, config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}, nil)

	first := f.send("POST", "/api/session/host", map[string]string{"roomName": "Movie night"})
	first.expect(t, 201, "")
	code, _ := first.Body["code"].(string)
	stamp, _ := first.Body["expiresAt"].(string)
	expires, err := time.Parse(time.RFC3339, stamp)
	if err != nil || time.Until(expires) < 9*time.Minute || time.Until(expires) > 10*time.Minute+time.Second {
		t.Fatalf("expiresAt = %q (%v)", stamp, err)
	}

	if err := os.WriteFile(filepath.Join(f.server.cfg.RoomsDir, code, "kept.txt"), []byte("hi"), 0o600); err != nil {
		t.Fatal(err)
	}

	// A second host is refused while the first is open, even with the same code.
	f.send("POST", "/api/session/host", map[string]string{"code": code}).expect(t, 409, "conflict")
	f.send("DELETE", "/api/session", nil).expect(t, 200, "")

	f.send("POST", "/api/session/host", map[string]string{"code": "nope"}).expect(t, 400, "bad_request")

	// Time passes, then the same code comes back with a new ten minutes.
	again := f.send("POST", "/api/session/host", map[string]string{"code": strings.ToLower(code)})
	again.expect(t, 201, "")
	if again.Body["code"] != code || again.Body["expiresAt"] == nil {
		t.Fatalf("reopen = %s", again.Raw)
	}
	if got := f.send("GET", "/api/files/local", nil); !strings.Contains(string(got.Raw), "kept.txt") {
		t.Fatalf("reopened folder lost its file: %s", got.Raw)
	}
}

func TestSeveralRoomsThroughAPI(t *testing.T) {
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	host := newFixture(t, config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}, nil)

	for _, code := range []string{firstRoom, secondRoom} {
		host.send("POST", "/api/session/host", map[string]string{"code": code}).expect(t, 201, "")
	}
	listed := host.send("GET", "/api/rooms", nil)
	if listed.Body["active"] != secondRoom || len(listed.Body["rooms"].([]any)) != 2 {
		t.Fatalf("two rooms = %s", listed.Raw)
	}
	host.send("POST", "/api/session/join", map[string]string{"code": firstRoom}).expect(t, 409, "conflict")

	left := host.send("DELETE", "/api/session?room="+secondRoom, nil)
	left.expect(t, 200, "")
	if left.Body["room"] != firstRoom {
		t.Fatalf("fallback = %s", left.Raw)
	}
	host.send("POST", "/api/session/host", map[string]string{"code": secondRoom}).expect(t, 201, "")
	left = host.send("DELETE", "/api/session?room="+firstRoom, nil)
	if left.Body["room"] != secondRoom {
		t.Fatalf("background leave changed active = %s", left.Raw)
	}
	host.send("DELETE", "/api/session?room="+secondRoom, nil).expect(t, 200, "")
	if state := host.send("GET", "/api/rooms", nil); state.Body["active"] != "" {
		t.Fatalf("last leave = %s", state.Raw)
	}
}
