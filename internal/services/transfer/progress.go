package transfer

import "time"

func shouldEmit(last, now time.Time) bool { return now.Sub(last) >= 100*time.Millisecond }

// Subscription includes a gap-free snapshot and subsequent updates.
type Subscription struct {
	Snapshot []Transfer
	Events   <-chan Event
	manager  *Manager
	ch       chan Event
}

// Subscribe returns the queue and all subsequent updates until its buffer fills.
func (manager *Manager) Subscribe() *Subscription {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	channel := make(chan Event, 64)
	subscription := &Subscription{
		Snapshot: manager.snapshotLocked(), Events: channel, manager: manager, ch: channel,
	}
	if manager.closed {
		close(channel)
	} else {
		manager.subscribers[subscription] = struct{}{}
	}
	return subscription
}

// Close releases a subscription and closes its event channel.
func (subscription *Subscription) Close() {
	subscription.manager.mu.Lock()
	defer subscription.manager.mu.Unlock()
	if _, exists := subscription.manager.subscribers[subscription]; exists {
		delete(subscription.manager.subscribers, subscription)
		close(subscription.ch)
	}
}

func (manager *Manager) emitLocked(item *job) {
	item.view.UpdatedAt = time.Now().UTC()
	snapshot := item.view
	for subscription := range manager.subscribers {
		select {
		case subscription.ch <- Event{Kind: "update", Transfer: &snapshot}:
		default:
			delete(manager.subscribers, subscription)
			close(subscription.ch)
		}
	}
}

func (manager *Manager) progress(item *job, count int) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	item.view.Bytes += int64(count)
	now := time.Now()
	// ponytail: speed is the run average; use a sliding window for short-term changes later.
	elapsed := now.Sub(item.started).Seconds()
	if elapsed > 0 {
		item.view.Speed = float64(item.view.Bytes-item.view.Offset) / elapsed
	}
	if shouldEmit(item.last, now) {
		item.last = now
		manager.emitLocked(item)
	}
}
