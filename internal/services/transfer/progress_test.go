package transfer

import (
	"testing"
	"time"
)

func TestProgressGate(t *testing.T) {
	start := time.Now()
	for elapsed := time.Duration(0); elapsed < 100*time.Millisecond; elapsed += time.Millisecond {
		if shouldEmit(start, start.Add(elapsed)) {
			t.Fatalf("emitted at %s", elapsed)
		}
	}
	if !shouldEmit(start, start.Add(100*time.Millisecond)) {
		t.Fatal("did not emit at boundary")
	}
}
