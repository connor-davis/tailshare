package peer_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

// TestOverRealSession runs the whole stack on a local relay: host and join by
// code, then hello, list, stat and chat in both directions over the first
// mesh control stream after local approval.
func TestOverRealSession(t *testing.T) {
	derpMap := tailcattest.LocalDERP(t)
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: tailcattest.ServeMap(t, derpMap)}
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()

	hostShare := realSessionFolder(t, map[string]string{"from-host.txt": "host file"})
	joinShare := realSessionFolder(t, map[string]string{"docs/from-joiner.txt": "joiner file"})
	host, code, err := session.Host(ctx, cfg, "Host", session.Options{Root: hostShare})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = host.Close() })
	allowed := make(chan error, 1)
	go func() {
		for {
			if pending, ok := host.Pending(); ok {
				allowed <- host.Allow(pending.ID)
				return
			}
			select {
			case <-host.Changes():
			case <-ctx.Done():
				allowed <- ctx.Err()
				return
			}
		}
	}()
	joiner, err := session.Join(ctx, code.String(), cfg, "Joiner", session.Options{Root: joinShare})
	if err != nil {
		t.Fatal(err)
	}
	if err := <-allowed; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = joiner.Close() })
	var hostPeer, joinPeer *peer.Peer
	for hostPeer == nil {
		for _, member := range host.Members() {
			if control, ok := host.Control(member.ID); ok {
				hostPeer = control
			}
		}
		if hostPeer != nil {
			break
		}
		select {
		case <-host.Changes():
		case <-ctx.Done():
			t.Fatal("host control missing")
		}
	}
	for _, member := range joiner.Members() {
		if control, ok := joiner.Control(member.ID); ok {
			joinPeer = control
		}
	}
	if joinPeer == nil {
		t.Fatal("joiner control missing")
	}

	if joinPeer.Remote().DisplayName != "Host" || hostPeer.Remote().DisplayName != "Joiner" {
		t.Fatalf("hello: %+v / %+v", joinPeer.Remote(), hostPeer.Remote())
	}

	hostSees, err := hostPeer.List(ctx, "docs", 0, 0)
	if err != nil || len(hostSees.Entries) != 1 || hostSees.Entries[0].Name != "from-joiner.txt" {
		t.Fatalf("host listing the joiner: %+v, %v", hostSees, err)
	}

	joinerSees, err := joinPeer.Stat(ctx, "from-host.txt")
	if err != nil || joinerSees.Size != int64(len("host file")) {
		t.Fatalf("joiner statting the host: %+v, %v", joinerSees, err)
	}

	if _, err := joinPeer.SendChat(ctx, "hi host"); err != nil {
		t.Fatal(err)
	}
	if _, err := hostPeer.SendChat(ctx, "hi joiner"); err != nil {
		t.Fatal(err)
	}

	hostLog := hostPeer.Subscribe().Snapshot
	if len(hostLog) != 2 || hostLog[0].Text != "hi host" || !hostLog[0].FromPeer {
		t.Fatalf("host chat log = %+v", hostLog)
	}
}

func realSessionFolder(t *testing.T, files map[string]string) *share.Root {
	t.Helper()
	dir := t.TempDir()
	for name, content := range files {
		path := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	root, err := share.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })
	return root
}
