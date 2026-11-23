package tailshare

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

type rosterResult struct {
	event string
	err   error
}

// joinPhone joins a new client to host and approves it.
func joinPhone(t *testing.T, host *session.Session, mapURL, code string) *Client {
	t.Helper()
	client := NewClient("Phone", mapURL, int(tailcattest.RegionID))
	t.Cleanup(func() { _ = client.Leave() })

	joined := make(chan error, 1)
	go func() { joined <- client.Join(code) }()
	approve(t, host)
	if err := <-joined; err != nil {
		t.Fatal(err)
	}

	return client
}

func readRoster(client *Client) chan rosterResult {
	out := make(chan rosterResult, 1)
	go func() {
		event, err := client.NextRosterEvent()
		out <- rosterResult{event, err}
	}()

	return out
}

func waitRoster(t *testing.T, out chan rosterResult) rosterResult {
	t.Helper()
	select {
	case got := <-out:
		return got
	case <-time.After(5 * time.Second):
		t.Fatal("NextRosterEvent did not return")
		return rosterResult{}
	}
}

func decodeRoster(t *testing.T, event string) rosterEvent {
	t.Helper()
	var decoded rosterEvent
	if err := json.Unmarshal([]byte(event), &decoded); err != nil {
		t.Fatal(err)
	}

	return decoded
}

func TestRosterAndRoomCode(t *testing.T) {
	mapURL := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	host, code := startHost(t, mapURL)
	client := joinPhone(t, host, mapURL, code)

	if got, want := client.RoomCode(), strings.ReplaceAll(code, "-", ""); got != want {
		t.Fatalf("RoomCode = %q, want %q", got, want)
	}

	got := waitRoster(t, readRoster(client))
	roster := decodeRoster(t, got.event)
	if got.err != nil || roster.Type != "roster" || len(roster.Members) != 2 {
		t.Fatalf("first = %+v", got)
	}

	hostSeat, phoneSeat := roster.Members[0], roster.Members[1]
	if !hostSeat.Host || hostSeat.You || hostSeat.DisplayName != "Desktop" {
		t.Fatalf("host seat = %+v", hostSeat)
	}
	if phoneSeat.Host || !phoneSeat.You || phoneSeat.Fingerprint != peer.Fingerprint(client.session.SelfID()) {
		t.Fatalf("phone seat = %+v", phoneSeat)
	}

	// The screen never gets the member id, the address or the join order.
	for _, secret := range []string{`"id"`, `"address"`, `"joinOrder"`} {
		if strings.Contains(got.event, secret) {
			t.Fatalf("roster leaks %s: %s", secret, got.event)
		}
	}
}

func TestRosterChangesWhenSomeoneJoins(t *testing.T) {
	mapURL := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	host, code := startHost(t, mapURL)
	client := joinPhone(t, host, mapURL, code)

	if got := waitRoster(t, readRoster(client)); got.err != nil || len(decodeRoster(t, got.event).Members) != 2 {
		t.Fatalf("first = %+v", got)
	}

	pending := readRoster(client)
	joinPhone(t, host, mapURL, code)

	got := waitRoster(t, pending)
	if got.err != nil || len(decodeRoster(t, got.event).Members) != 3 {
		t.Fatalf("after join = %+v", got)
	}
}

func TestRosterIgnoresFilesChange(t *testing.T) {
	mapURL := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	host, code := startHost(t, mapURL)
	client := joinPhone(t, host, mapURL, code)

	if got := waitRoster(t, readRoster(client)); got.err != nil {
		t.Fatalf("first = %+v", got)
	}

	pending := readRoster(client)
	host.NotifyShareChanged()
	select {
	case got := <-pending:
		t.Fatalf("a files change made a roster event: %+v", got)
	case <-time.After(500 * time.Millisecond):
	}
}

func TestLeaveWakesRosterReader(t *testing.T) {
	mapURL := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	host, code := startHost(t, mapURL)
	client := joinPhone(t, host, mapURL, code)

	if got := waitRoster(t, readRoster(client)); got.err != nil {
		t.Fatalf("first = %+v", got)
	}

	pending := readRoster(client)
	time.Sleep(100 * time.Millisecond)
	if err := client.Leave(); err != nil {
		t.Fatal(err)
	}

	if got := waitRoster(t, pending); got.err != nil || got.event != `{"type":"closed"}` {
		t.Fatalf("closed = %+v", got)
	}
	if got := waitRoster(t, readRoster(client)); got.err == nil {
		t.Fatalf("after close = %+v, want an error", got)
	}
	if client.RoomCode() != "" {
		t.Fatal("room code survived Leave")
	}
}
