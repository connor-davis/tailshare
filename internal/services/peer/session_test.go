package peer

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/platform/config"
	"github.com/Polyphron-AI/tailshare/internal/services/session"
	"github.com/Polyphron-AI/tailshare/internal/testsupport/tailcattest"
)

// TestOverRealSession runs the whole stack on a local relay: host and join by
// code, then hello, list, stat and chat in both directions over the first
// stream after the rekey.
func TestOverRealSession(t *testing.T) {
	derpMap := tailcattest.LocalDERP(t)
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: tailcattest.ServeMap(t, derpMap)}
	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()

	host, code, err := session.Host(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = host.Close() })

	joiner, err := session.Join(ctx, code.String(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = joiner.Close() })

	outgoing, err := joiner.Open(ctx)
	if err != nil {
		t.Fatal(err)
	}

	accepted := make(chan net.Conn, 1)
	go func() {
		conn, _ := host.Accept()
		accepted <- conn
	}()

	hostShare := sharedFolder(t, map[string]string{"from-host.txt": "host file"})
	joinShare := sharedFolder(t, map[string]string{"docs/from-joiner.txt": "joiner file"})

	var hostPeer *Peer
	started := make(chan error, 1)
	go func() {
		var err error
		hostPeer, err = Start(ctx, <-accepted, Options{DisplayName: "Host", Share: hostShare})
		started <- err
	}()

	joinPeer, err := Start(ctx, outgoing, Options{DisplayName: "Joiner", Share: joinShare})
	if err != nil {
		t.Fatal(err)
	}
	if err := <-started; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = joinPeer.Close(); _ = hostPeer.Close() })

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
