package api

import (
	"context"
	"strconv"
	"sync"
	"testing"

	"github.com/Polyphron-AI/tailshare/internal/platform/apperr"
	"github.com/Polyphron-AI/tailshare/internal/platform/config"
)

// fakeTransfers is a manager that only remembers what it was asked.
type fakeTransfers struct {
	mu     sync.Mutex
	items  []TransferItem
	events chan TransferEvent
	asked  []string
}

func newFake() *fakeTransfers {
	return &fakeTransfers{events: make(chan TransferEvent, 8)}
}

func (fake *fakeTransfers) Enqueue(_ context.Context, request TransferRequest) (TransferItem, error) {
	fake.mu.Lock()
	defer fake.mu.Unlock()

	item := TransferItem{
		ID: strconv.Itoa(len(fake.items) + 1), Direction: request.Direction,
		Source: request.Source, Destination: request.Destination, State: "queued",
	}
	fake.items = append(fake.items, item)
	fake.asked = append(fake.asked, "enqueue "+item.ID)

	return item, nil
}

func (fake *fakeTransfers) change(verb, id, state string) (TransferItem, error) {
	fake.mu.Lock()
	defer fake.mu.Unlock()

	fake.asked = append(fake.asked, verb+" "+id)

	for index := range fake.items {
		if fake.items[index].ID != id {
			continue
		}
		if fake.items[index].State == "canceled" {
			return TransferItem{}, apperr.Conflict("conflict", "That transfer has ended.")
		}

		fake.items[index].State = state

		return fake.items[index], nil
	}

	return TransferItem{}, apperr.NotFound("That transfer was not found.")
}

func (fake *fakeTransfers) Pause(_ context.Context, id string) (TransferItem, error) {
	return fake.change("pause", id, "paused")
}

func (fake *fakeTransfers) Resume(_ context.Context, id string) (TransferItem, error) {
	return fake.change("resume", id, "running")
}

func (fake *fakeTransfers) Cancel(_ context.Context, id string) (TransferItem, error) {
	return fake.change("cancel", id, "canceled")
}

func (fake *fakeTransfers) List() []TransferItem {
	fake.mu.Lock()
	defer fake.mu.Unlock()

	return append([]TransferItem(nil), fake.items...)
}

func (fake *fakeTransfers) Subscribe() (<-chan TransferEvent, func()) {
	return fake.events, func() {}
}

func TestTransfersNotConnected(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	for _, route := range []struct{ method, path string }{
		{"GET", "/api/transfers"},
		{"POST", "/api/transfers"},
		{"POST", "/api/transfers/1/pause"},
		{"POST", "/api/transfers/1/resume"},
		{"DELETE", "/api/transfers/1"},
	} {
		f.send(route.method, route.path, map[string]string{}).expect(t, 409, "not_connected")
	}
}

func TestTransferRoutes(t *testing.T) {
	fake := newFake()
	f := newFixture(t, config.Config{}, fake)
	f.chooseFolder()

	f.connectPipe()

	empty := f.send("GET", "/api/transfers", nil)
	empty.expect(t, 200, "")

	if items, ok := empty.Body["items"].([]any); !ok || len(items) != 0 {
		t.Fatalf("empty list = %s", empty.Raw)
	}

	upload := map[string]string{"direction": "upload", "source": "a.txt", "destination": "docs/a.txt"}

	for _, bad := range []any{
		map[string]string{"direction": "sideways", "source": "a", "destination": "b"},
		map[string]string{"direction": "upload", "destination": "b"},
		map[string]string{"direction": "download", "source": "a"},
		"not an object",
	} {
		f.send("POST", "/api/transfers", bad).expect(t, 400, "bad_request")
	}

	up := f.send("POST", "/api/transfers", upload)
	up.expect(t, 202, "")

	if up.Body["id"] != "1" || up.Body["direction"] != "upload" || up.Body["state"] != "queued" {
		t.Fatalf("upload = %s", up.Raw)
	}

	download := map[string]string{"direction": "download", "source": "b.txt", "destination": "b.txt"}
	down := f.send("POST", "/api/transfers", download)
	down.expect(t, 202, "")

	if down.Body["id"] != "2" || down.Body["direction"] != "download" {
		t.Fatalf("download = %s", down.Raw)
	}

	if got := f.send("POST", "/api/transfers/1/pause", nil); got.Body["state"] != "paused" {
		t.Fatalf("pause = %s", got.Raw)
	}
	if got := f.send("POST", "/api/transfers/1/resume", nil); got.Body["state"] != "running" {
		t.Fatalf("resume = %s", got.Raw)
	}
	if got := f.send("DELETE", "/api/transfers/1", nil); got.Body["state"] != "canceled" {
		t.Fatalf("cancel = %s", got.Raw)
	}

	// Manager errors pass through with their own status and code.
	f.send("POST", "/api/transfers/99/pause", nil).expect(t, 404, "not_found")
	f.send("POST", "/api/transfers/1/pause", nil).expect(t, 409, "conflict")

	list := f.send("GET", "/api/transfers", nil)
	list.expect(t, 200, "")

	if items, _ := list.Body["items"].([]any); len(items) != 2 {
		t.Fatalf("list = %s", list.Raw)
	}

	want := []string{"enqueue 1", "enqueue 2", "pause 1", "resume 1", "cancel 1", "pause 99", "pause 1"}
	if len(fake.asked) != len(want) {
		t.Fatalf("manager was asked %v, want %v", fake.asked, want)
	}

	for index := range want {
		if fake.asked[index] != want[index] {
			t.Fatalf("manager was asked %v, want %v", fake.asked, want)
		}
	}
}
