package transfer

import (
	"crypto/rand"
	"errors"
	"time"
)

// planRetryLocked schedules an automatic retry after a dropped or busy attempt. Anything the
// user caused, or that retrying cannot fix (a bad checksum, a refusal), stays failed.
func (manager *Manager) planRetryLocked(item *job, err error) {
	if err == nil || manager.closed || !item.view.Initiator || item.view.State != Failed ||
		item.attempt >= len(manager.retryDelays) ||
		(!errors.Is(err, errDropped) && !errors.Is(err, errBusy)) {
		return
	}

	delay := manager.retryDelays[item.attempt]
	item.view.RetryAt = time.Now().UTC().Add(delay)
	item.retry = time.AfterFunc(delay, func() { manager.retry(item) })
}

// retry replaces a failed row with a new attempt, so one file shows as one row.
func (manager *Manager) retry(previous *job) {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	if manager.closed || previous.retry == nil || manager.jobs[previous.view.ID] != previous {
		return
	}

	previous.retry = nil
	item := manager.newJobLocked(
		rand.Text(), previous.local, previous.view.PeerPath, previous.view.Direction, true,
	)
	item.root, item.attempt, item.view.Attempt = previous.root, previous.attempt+1, previous.attempt+1
	manager.removeLocked([]string{previous.view.ID})
	manager.scheduleLocked()
}

// SetSlots changes how many transfers run at once. Running work is never cut short.
func (manager *Manager) SetSlots(count int) error {
	if count < 1 || count > maxSlots {
		return errInvalid
	}

	manager.mu.Lock()
	defer manager.mu.Unlock()

	manager.slots = count
	manager.scheduleLocked()
	return nil
}

// Forget drops finished rows (done, failed or canceled) from the queue and returns their
// IDs. It never touches a partial file, so a failed transfer can still resume from it.
func (manager *Manager) Forget() []string {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	var ids []string
	for _, id := range manager.order {
		item := manager.jobs[id]
		finished := item.view.State == Done || item.view.State == Failed || item.view.State == Canceled
		if finished && !item.working && item.retry == nil {
			ids = append(ids, id)
		}
	}

	manager.removeLocked(ids)
	return ids
}

// removeLocked deletes rows and tells subscribers, so every screen drops them together.
func (manager *Manager) removeLocked(ids []string) {
	if len(ids) == 0 {
		return
	}

	gone := make(map[string]bool, len(ids))
	for _, id := range ids {
		gone[id] = true
		delete(manager.jobs, id)
	}

	order := manager.order[:0]
	for _, id := range manager.order {
		if !gone[id] {
			order = append(order, id)
		}
	}
	manager.order = order

	for subscription := range manager.subscribers {
		select {
		case subscription.ch <- Event{Kind: "removed", IDs: ids}:
		default:
			delete(manager.subscribers, subscription)
			close(subscription.ch)
		}
	}
}
