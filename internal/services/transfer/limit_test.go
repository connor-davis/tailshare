package transfer

import "testing"

func TestSetSlotsRunsThreeAndKeepsRunningWork(t *testing.T) {
	pair := pair(t, "", "")
	putFile(t, pair.hostDir, "source", 32<<20)
	if err := pair.join.SetSlots(0); err == nil {
		t.Fatal("zero slots accepted")
	}
	if err := pair.join.SetSlots(maxSlots + 1); err == nil {
		t.Fatal("too many slots accepted")
	}
	if err := pair.join.SetSlots(3); err != nil {
		t.Fatal(err)
	}

	pair.join.mu.Lock()
	pair.join.attached = false
	pair.join.mu.Unlock()
	for _, name := range []string{"a", "b", "c", "d"} {
		if _, err := pair.join.Download(pair.ctx, "source", "received"+name); err != nil {
			t.Fatal(err)
		}
	}
	pair.join.mu.Lock()
	pair.join.attached = true
	pair.join.scheduleLocked()
	starting := pair.join.slotsLocked()
	// Lowering the cap leaves what runs alone and starts nothing new.
	pair.join.slots = 1
	pair.join.scheduleLocked()
	after := pair.join.slotsLocked()
	pair.join.mu.Unlock()
	if starting != 3 || after != 3 {
		t.Fatalf("working %d then %d", starting, after)
	}
}
