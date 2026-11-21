package transfer

import (
	"context"
	"sync"
	"time"
)

// maxLimitKiB matches the settings screen: one GiB a second is "fast enough to be no limit".
const maxLimitKiB = 1 << 20

// limiter paces all transfers in one direction to a shared bytes-per-second rate.
type limiter struct {
	mu   sync.Mutex
	rate float64
	next time.Time
}

func (limit *limiter) set(kib int) {
	limit.mu.Lock()
	defer limit.mu.Unlock()

	limit.rate = float64(kib) * 1024
	limit.next = time.Time{}
}

// wait sleeps long enough that count bytes stay under the rate. A quarter second of burst
// is free, so small writes never stall.
func (limit *limiter) wait(ctx context.Context, count int) {
	limit.mu.Lock()
	if limit.rate <= 0 || count <= 0 {
		limit.mu.Unlock()
		return
	}

	now := time.Now()
	if limit.next.Before(now) {
		limit.next = now
	}
	limit.next = limit.next.Add(time.Duration(float64(count) / limit.rate * float64(time.Second)))
	pause := limit.next.Sub(now) - 250*time.Millisecond
	limit.mu.Unlock()

	if pause <= 0 {
		return
	}

	timer := time.NewTimer(pause)
	defer timer.Stop()

	select {
	case <-timer.C:
	case <-ctx.Done():
	}
}

// SetLimits changes the upload and download speed caps in KiB a second. Zero means no cap.
func (manager *Manager) SetLimits(uploadKiB, downloadKiB int) error {
	if uploadKiB < 0 || uploadKiB > maxLimitKiB || downloadKiB < 0 || downloadKiB > maxLimitKiB {
		return errInvalid
	}

	manager.upload.set(uploadKiB)
	manager.download.set(downloadKiB)
	return nil
}
