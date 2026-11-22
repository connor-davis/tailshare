package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
	"github.com/fasthttp/websocket"
)

// dial opens the live socket. It returns the handshake answer even when the
// server refused, so tests can check the status.
func (f *fixture) dial(protocols []string, header http.Header, query string) (*websocket.Conn, *http.Response, error) {
	dialer := websocket.Dialer{Subprotocols: protocols, HandshakeTimeout: 5 * time.Second}

	return dialer.Dial("ws://"+f.host+"/api/live"+query, header)
}

// dialLive opens the live socket the way the renderer does.
func (f *fixture) dialLive() *websocket.Conn {
	f.t.Helper()

	conn, _, err := f.dial([]string{wsProtocol, testToken}, nil, "")
	if err != nil {
		f.t.Fatal(err)
	}
	f.t.Cleanup(func() { _ = conn.Close() })

	return conn
}

// next reads one event.
func next(t *testing.T, conn *websocket.Conn) Event {
	t.Helper()

	_ = conn.SetReadDeadline(time.Now().Add(30 * time.Second))

	_, raw, err := conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}

	var event Event
	if err := json.Unmarshal(raw, &event); err != nil {
		t.Fatalf("%s: %v", raw, err)
	}

	return event
}

// until reads events until one has the type, and returns it.
func until(t *testing.T, conn *websocket.Conn, kind string, match func(Event) bool) Event {
	t.Helper()

	for {
		event := next(t, conn)
		if event.Type == kind && (match == nil || match(event)) {
			return event
		}
	}
}

func (f *fixture) clients() int {
	f.server.hub.mu.Lock()
	defer f.server.hub.mu.Unlock()

	return len(f.server.hub.clients)
}

func eventually(t *testing.T, what string, check func() bool) {
	t.Helper()

	deadline := time.Now().Add(30 * time.Second)
	for !check() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}

		time.Sleep(20 * time.Millisecond)
	}
}

func TestLiveHandshakeRefusals(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	wrong := strings.Repeat("cd", 32)
	bearer := http.Header{"Authorization": {"Bearer " + testToken}}

	cases := []struct {
		name      string
		protocols []string
		header    http.Header
		query     string
		status    int
	}{
		{"no protocols", nil, nil, "", 401},
		{"bearer header only", nil, bearer, "", 401},
		{"bearer plus base protocol", []string{wsProtocol}, bearer, "", 401},
		{"wrong token", []string{wsProtocol, wrong}, nil, "", 401},
		{"query token", []string{wsProtocol}, nil, "?token=" + testToken, 401},
		{"query token without protocol", nil, nil, "?token=" + testToken, 401},
		{"two tokens", []string{wsProtocol, testToken, wrong}, nil, "", 401},
		{"token without base protocol", []string{testToken}, nil, "", 400},
		{"wrong base protocol", []string{"tailshare.v2", testToken}, nil, "", 401},
		{"foreign origin", []string{wsProtocol, testToken}, http.Header{"Origin": {"https://evil.example"}}, "", 403},
	}

	for _, tc := range cases {
		conn, response, err := f.dial(tc.protocols, tc.header, tc.query)
		if err == nil {
			_ = conn.Close()
			t.Errorf("%s: the handshake succeeded", tc.name)

			continue
		}

		if response == nil || response.StatusCode != tc.status {
			t.Errorf("%s: %v, want status %d", tc.name, response, tc.status)
		}
	}

	if f.clients() != 0 {
		t.Fatalf("%d clients registered by refused handshakes", f.clients())
	}
}

func TestLiveSnapshotThenEvents(t *testing.T) {
	fake := newFake()
	f := newFixture(t, config.Config{}, fake)
	f.chooseFolder("a.txt")

	fake.items = []TransferItem{{ID: "1", Direction: "upload", State: "running"}}

	// Both accepted origins may open the socket.
	for _, origin := range []string{"null", "http://localhost:5173"} {
		conn, response, err := f.dial([]string{wsProtocol, testToken}, http.Header{"Origin": {origin}}, "")
		if err != nil {
			t.Fatalf("origin %q: %v", origin, err)
		}

		// The token is not echoed back: the agreed protocol is the base one.
		if got := response.Header.Get("Sec-WebSocket-Protocol"); got != wsProtocol {
			t.Fatalf("origin %q: protocol %q", origin, got)
		}

		_ = conn.Close()
	}

	conn := f.dialLive()

	snapshot := next(t, conn)
	if snapshot.Type != "snapshot" {
		t.Fatalf("first message = %+v", snapshot)
	}

	data, _ := json.Marshal(snapshot.Data)

	var got Snapshot
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	if got.Session.State != phaseIdle ||
		len(got.Transfers) != 1 || got.Transfers[0].ID != "1" {
		t.Fatalf("snapshot = %s", data)
	}

	// Events from the manager are forwarded, in order, after the snapshot.
	fake.events <- TransferEvent{Type: "transfer.progress", Item: TransferItem{ID: "1", Bytes: 10}}
	fake.events <- TransferEvent{Type: "transfer.state", Item: TransferItem{ID: "1", State: "done"}}

	progress := next(t, conn)
	state := next(t, conn)

	if progress.Type != "transfer.progress" || state.Type != "transfer.state" ||
		progress.Seq <= snapshot.Seq || state.Seq != progress.Seq+1 {
		t.Fatalf("events = %+v then %+v after %+v", progress, state, snapshot)
	}

	// Two clients each get every event.
	second := f.dialLive()
	next(t, second)

	f.server.hub.publish("session.state", SessionState{State: phaseIdle})

	for _, socket := range []*websocket.Conn{conn, second} {
		until(t, socket, "session.state", nil)
	}
}

func TestLiveDisconnectUnsubscribes(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	conn := f.dialLive()
	next(t, conn)

	eventually(t, "the client to register", func() bool { return f.clients() == 1 })

	_ = conn.Close()

	eventually(t, "the client to unsubscribe", func() bool { return f.clients() == 0 })
}

func TestShutdownClosesLiveClients(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	conn := f.dialLive()
	next(t, conn)

	if err := f.server.Shutdown(2 * time.Second); err != nil {
		t.Fatal(err)
	}

	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	if _, _, err := conn.ReadMessage(); err == nil {
		t.Fatal("the socket stayed open after shutdown")
	}
}

func TestStalledClientIsDroppedWithoutBlocking(t *testing.T) {
	h := newHub()

	kicked := make(chan struct{}, 1)
	stalled := h.add(func() any { return nil }, func() { kicked <- struct{}{} })

	healthy := h.add(func() any { return nil }, func() {})
	drain := make(chan int, 1)

	go func() {
		count := 0
		for range healthy.send {
			count++
		}

		drain <- count
	}()

	started := time.Now()
	for range clientQueue * 3 {
		h.publish("tick", 1)
	}

	if time.Since(started) > 2*time.Second {
		t.Fatal("publishing waited for the stalled client")
	}

	select {
	case <-kicked:
	case <-time.After(2 * time.Second):
		t.Fatal("the stalled client was not closed")
	}

	if _, live := h.clients[stalled]; live {
		t.Fatal("the stalled client is still registered")
	}

	// The healthy client kept receiving; its queue only held 64, so it was
	// dropped too unless it drained fast enough. Either way nobody blocked.
	h.closeAll()

	if <-drain == 0 {
		t.Fatal("the healthy client heard nothing")
	}
}

func TestHubSequenceAndClose(t *testing.T) {
	h := newHub()
	first := h.add(func() any { return "now" }, func() {})

	h.publish("a", nil)
	h.publish("b", nil)

	var seqs []int64
	for range 3 {
		var event Event
		if err := json.Unmarshal(<-first.send, &event); err != nil {
			t.Fatal(err)
		}

		seqs = append(seqs, event.Seq)
	}

	if seqs[0] != 0 || seqs[1] != 1 || seqs[2] != 2 {
		t.Fatalf("seqs = %v", seqs)
	}

	h.remove(first)
	h.remove(first) // a second call must be harmless

	h.closeAll()

	if h.add(func() any { return nil }, func() {}) != nil {
		t.Fatal("a closed hub accepted a client")
	}
}

func mustJSON(value any) []byte {
	raw, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}

	return raw
}

func TestRemovedEventReachesLiveSocket(t *testing.T) {
	fake := newFake()
	f := newFixture(t, config.Config{}, fake)
	live := f.dialLive()
	next(t, live)

	fake.events <- TransferEvent{Type: "transfer.removed", IDs: []string{"a", "b"}}

	event := until(t, live, "transfer.removed", nil)
	if got := string(mustJSON(event.Data)); !strings.Contains(got, `"ids":["a","b"]`) {
		t.Fatalf("removed event = %s", got)
	}
}

func TestSharedFolderChangeBecomesFilesChanged(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	fake := f.connectPipe()
	local := f.server.peer
	go f.server.forwardChat(local, local.Subscribe())
	live := f.dialLive()
	defer live.Close()
	next(t, live)

	if err := fake.Notify(peer.MethodShareChanged, peer.ShareChanged{}); err != nil {
		t.Fatal(err)
	}

	event := until(t, live, "files.changed", nil)
	if string(mustJSON(event.Data)) != "{}" {
		t.Fatalf("data = %s", mustJSON(event.Data))
	}
}

func TestAddingRoomFilesTellsTheJoiner(t *testing.T) {
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}
	host, join := newFixture(t, cfg, nil), newFixture(t, cfg, nil)
	hosted := host.send("POST", "/api/session/host", nil)
	hosted.expect(t, 201, "")
	t.Cleanup(func() { host.server.leave(); join.server.leave() })

	joinWithApproval(t, host, join, hosted.Body["code"].(string)).expect(t, 200, "")

	live := join.dialLive()
	defer live.Close()
	next(t, live)

	source := filepath.Join(t.TempDir(), "fresh.txt")
	if err := os.WriteFile(source, []byte("fresh"), 0o644); err != nil {
		t.Fatal(err)
	}

	host.send("POST", "/api/room/files", map[string]any{"paths": []string{source}}, mainHeader).
		expect(t, 200, "")
	until(t, live, "files.changed", nil)
}
