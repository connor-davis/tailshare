package transfer

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/connor-davis/tailshare/internal/services/share"
)

func TestForgetKeepsLiveRowsAndPartials(t *testing.T) {
	manager, dir := idle(t)
	states := []State{Done, Failed, Canceled, Queued, Paused}
	var ids []string
	for i := range states {
		queued, err := manager.Download(t.Context(), "remote", "file"+string(rune('a'+i)))
		if err != nil {
			t.Fatal(err)
		}
		setState(manager, queued.ID, states[i])
		ids = append(ids, queued.ID)
	}
	if err := manager.root.ClaimPartial("fileb", "local", "", 3); err != nil {
		t.Fatal(err)
	}
	if err := receiveTo(manager.root, "fileb", 0, 3, bytes.NewBufferString("abc")); err != nil {
		t.Fatal(err)
	}

	removed := manager.Forget()
	if len(removed) != 3 || removed[0] != ids[0] || removed[1] != ids[1] || removed[2] != ids[2] {
		t.Fatalf("removed %v", removed)
	}
	rows := manager.Snapshot()
	if len(rows) != 2 || rows[0].State != Queued || rows[1].State != Paused {
		t.Fatalf("rows %+v", rows)
	}
	if _, err := os.Stat(filepath.Join(dir, "fileb"+share.PartialSuffix)); err != nil {
		t.Fatalf("partial gone: %v", err)
	}
}
