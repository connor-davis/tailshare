package api

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/connor-davis/tailshare/internal/platform/config"
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

	// A good code still needs a folder first.
	f.send("POST", "/api/session/join", map[string]string{"code": "7K3Q-9PXM"}).expect(t, 409, "no_folder")

	// A failed start leaves the session idle, so it can be tried again.
	if got := f.send("GET", "/api/session", nil); got.Body["state"] != phaseIdle {
		t.Fatalf("session = %s", got.Raw)
	}
}

// TestSessionLifecycle runs two APIs against a local relay: host, join, the
// single-session rule, files, chat, events, leaving, and the host noticing.
func TestSessionLifecycle(t *testing.T) {
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}

	host := newFixture(t, cfg, nil)
	join := newFixture(t, cfg, nil)

	host.chooseFolder("from-host.txt")
	join.chooseFolder("docs/from-joiner.txt")

	hostLive := host.dialLive()
	next(t, hostLive)

	hosting := host.send("POST", "/api/session/host", nil)
	hosting.expect(t, 201, "")

	code, _ := hosting.Body["code"].(string)
	if hosting.Body["state"] != phaseHosting || hosting.Body["role"] != roleHost || len(code) != 9 {
		t.Fatalf("host = %s", hosting.Raw)
	}

	// One session at a time, and the folder is fixed while it is open.
	host.send("POST", "/api/session/host", nil).expect(t, 409, "conflict")
	host.send("POST", "/api/session/join", map[string]string{"code": code}).expect(t, 409, "conflict")
	host.send("PUT", "/api/folder", map[string]string{"path": t.TempDir()}).expect(t, 409, "conflict")

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

	// Leaving ends both sides: the joiner at once, the host when it notices.
	join.send("DELETE", "/api/session", nil).expect(t, 200, "")

	if got := join.send("GET", "/api/session", nil); got.Body["state"] != phaseIdle {
		t.Fatalf("joiner after leaving = %s", got.Raw)
	}

	until(t, hostLive, "session.state", func(e Event) bool {
		return strings.Contains(string(mustJSON(e.Data)), `"state":"idle"`)
	})

	// The folder stays chosen, and chat needs a connection again.
	host.send("GET", "/api/files/local", nil).expect(t, 200, "")
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
	host.chooseFolder()
	join.chooseFolder()
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
	host.send("POST", fmt.Sprintf("/api/session/joins/%d/allow", state.Join.ID), nil).expect(t, 409, "conflict")
}
