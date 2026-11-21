package api

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/share"
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

func (fake *fakeTransfers) EnqueueInto(
	ctx context.Context, request TransferRequest, _ *share.Root,
) (TransferItem, error) {
	return fake.Enqueue(ctx, request)
}

func (fake *fakeTransfers) Clear(context.Context) ([]string, error) {
	fake.mu.Lock()
	defer fake.mu.Unlock()

	var removed []string
	kept := fake.items[:0]
	for _, item := range fake.items {
		if item.State == "done" || item.State == "failed" || item.State == "canceled" {
			removed = append(removed, item.ID)
			continue
		}
		kept = append(kept, item)
	}
	fake.items = kept
	return removed, nil
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

func TestClearTransfersRoute(t *testing.T) {
	fake := newFake()
	f := newFixture(t, config.Config{}, fake)
	f.chooseFolder()
	f.connectPipe()

	fake.items = []TransferItem{
		{ID: "1", State: "done"}, {ID: "2", State: "running"}, {ID: "3", State: "failed"},
		{ID: "4", State: "canceled"}, {ID: "5", State: "queued"}, {ID: "6", State: "paused"},
	}

	cleared := f.send("POST", "/api/transfers/clear", nil)
	cleared.expect(t, 200, "")
	removed, _ := cleared.Body["removed"].([]any)
	if len(removed) != 3 {
		t.Fatalf("removed = %s", cleared.Raw)
	}

	list := f.send("GET", "/api/transfers", nil)
	items, _ := list.Body["items"].([]any)
	if len(items) != 3 {
		t.Fatalf("list = %s", list.Raw)
	}
}

func TestTransferLimitsRoute(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	ok := map[string]int{"transfersAtOnce": 3, "uploadLimitKiB": 100, "downloadLimitKiB": 0}

	f.send("PUT", "/api/transfers/limits", ok).expect(t, 403, "forbidden")
	f.send("PUT", "/api/transfers/limits", ok, mainHeader).expect(t, 200, "")
	if f.server.limits.slots != 3 || f.server.limits.uploadKiB != 100 {
		t.Fatalf("limits = %+v", f.server.limits)
	}

	for _, bad := range []map[string]int{
		{"transfersAtOnce": 0},
		{"transfersAtOnce": 9},
		{"transfersAtOnce": 2, "uploadLimitKiB": -1},
		{"transfersAtOnce": 2, "downloadLimitKiB": 1048577},
	} {
		f.send("PUT", "/api/transfers/limits", bad, mainHeader).expect(t, 400, "bad_request")
	}
}

func TestSaveTransferNeedsMainAndSafeFolder(t *testing.T) {
	fake := newFake()
	f := newFixture(t, config.Config{}, fake)
	f.chooseFolder()
	f.connectPipe()

	dir := t.TempDir()
	body := map[string]string{"source": "docs/a.txt", "folder": dir, "name": "a.txt"}
	f.send("POST", "/api/transfers/save", body).expect(t, 403, "forbidden")

	file := filepath.Join(dir, "plain.txt")
	if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "link")
	linked := os.Symlink(dir, link) == nil

	bad := []string{"relative/folder", dir + string(filepath.Separator) + ".." + string(filepath.Separator) + "x",
		file, filepath.Join(dir, "missing"), ""}
	if linked {
		bad = append(bad, link)
	}
	for _, folder := range bad {
		attempt := map[string]string{"source": "docs/a.txt", "folder": folder, "name": "a.txt"}
		f.send("POST", "/api/transfers/save", attempt, mainHeader).expect(t, 400, "bad_request")
	}

	for _, name := range []string{"../a.txt", "sub/a.txt", ""} {
		attempt := map[string]string{"source": "docs/a.txt", "folder": dir, "name": name}
		got := f.send("POST", "/api/transfers/save", attempt, mainHeader)
		if got.Status != 400 {
			t.Fatalf("name %q = %d %s", name, got.Status, got.Raw)
		}
	}

	f.send("POST", "/api/transfers/save", body, mainHeader).expect(t, 202, "")
}
