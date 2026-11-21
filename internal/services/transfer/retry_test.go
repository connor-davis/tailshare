package transfer

import (
	"bytes"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/services/share"
)

// idle returns a manager that never attaches, so jobs stay where the test puts them.
func idle(t *testing.T) (*Manager, string) {
	t.Helper()
	dir := t.TempDir()
	manager := New(openRoot(t, dir))
	t.Cleanup(func() { _ = manager.Close() })
	return manager, dir
}

func setState(manager *Manager, id string, state State) {
	manager.mu.Lock()
	manager.jobs[id].view.State = state
	manager.mu.Unlock()
}

func TestRetryOnlyForDroppedAndBusy(t *testing.T) {
	manager, _ := idle(t)
	queued, err := manager.Download(t.Context(), "remote", "local")
	if err != nil {
		t.Fatal(err)
	}
	item := manager.jobs[queued.ID]
	manager.mu.Lock()
	defer manager.mu.Unlock()
	item.view.State = Failed

	for _, refused := range []error{errChecksum, errInvalid, share.ErrExists, nil} {
		manager.planRetryLocked(item, refused)
		if item.retry != nil {
			t.Fatalf("retried %v", refused)
		}
	}

	manager.planRetryLocked(item, errBusy)
	if item.retry == nil || item.view.RetryAt.IsZero() {
		t.Fatal("busy was not retried")
	}
	item.retry.Stop()
	item.retry = nil

	item.attempt = len(manager.retryDelays)
	manager.planRetryLocked(item, errDropped)
	if item.retry != nil {
		t.Fatal("retried past the limit")
	}
}

func TestRetryReplacesRowWithNextAttempt(t *testing.T) {
	manager, _ := idle(t)
	manager.retryDelays = []time.Duration{10 * time.Millisecond}
	queued, err := manager.Download(t.Context(), "remote", "local")
	if err != nil {
		t.Fatal(err)
	}
	item := manager.jobs[queued.ID]
	subscription := manager.Subscribe()
	defer subscription.Close()

	manager.mu.Lock()
	item.view.State = Failed
	manager.planRetryLocked(item, errDropped)
	manager.mu.Unlock()

	deadline := time.After(5 * time.Second)
	for {
		select {
		case event := <-subscription.Events:
			if event.Kind != "removed" {
				continue
			}
			rows := manager.Snapshot()
			if len(event.IDs) != 1 || event.IDs[0] != queued.ID || len(rows) != 1 ||
				rows[0].Attempt != 1 || rows[0].Name != "local" || rows[0].ID == queued.ID {
				t.Fatalf("removed %v, rows %+v", event.IDs, rows)
			}
			return
		case <-deadline:
			t.Fatalf("no retry: %+v", manager.Snapshot())
		}
	}
}

func TestCancelDuringRetryWaitStopsRetryAndRemovesPartial(t *testing.T) {
	manager, dir := idle(t)
	manager.retryDelays = []time.Duration{50 * time.Millisecond}
	queued, err := manager.Download(t.Context(), "remote", "local")
	if err != nil {
		t.Fatal(err)
	}
	item := manager.jobs[queued.ID]
	if err := item.root.ClaimPartial("local", "local", "", 3); err != nil {
		t.Fatal(err)
	}
	if err := receiveTo(item.root, "local", 0, 3, bytes.NewBufferString("abc")); err != nil {
		t.Fatal(err)
	}
	manager.mu.Lock()
	item.view.State = Failed
	manager.planRetryLocked(item, errDropped)
	manager.mu.Unlock()

	if err := manager.Cancel(queued.ID); err != nil {
		t.Fatal(err)
	}
	time.Sleep(150 * time.Millisecond)

	rows := manager.Snapshot()
	if len(rows) != 1 || rows[0].State != Canceled || !rows[0].RetryAt.IsZero() {
		t.Fatalf("rows: %+v", rows)
	}
	assertMissing(t, dir, "local"+share.PartialSuffix)
}

func TestRetryFinishesDroppedUpload(t *testing.T) {
	pair := pair(t, "", "")
	pair.host.retryDelays = []time.Duration{50 * time.Millisecond}
	data := putFile(t, pair.hostDir, "source", 64<<20)
	transfer, err := pair.host.Upload(pair.ctx, "source", "received")
	if err != nil {
		t.Fatal(err)
	}
	waitFor(t, pair.join, transfer.ID, func(view Transfer) bool {
		return view.Bytes >= 1<<20 && view.State == Running
	})

	// Cut the receiver's data stream, as a network drop would.
	pair.join.mu.Lock()
	_ = pair.join.jobs[transfer.ID].conn.Close()
	pair.join.mu.Unlock()

	deadline := time.After(60 * time.Second)
	for {
		rows := pair.host.Snapshot()
		if len(rows) == 1 && rows[0].State == Done {
			if rows[0].Attempt != 1 {
				t.Fatalf("attempt %d", rows[0].Attempt)
			}
			break
		}
		select {
		case <-deadline:
			t.Fatalf("no retry: %+v", rows)
		case <-time.After(50 * time.Millisecond):
		}
	}
	assertFile(t, pair.joinDir, "received", data)
}
