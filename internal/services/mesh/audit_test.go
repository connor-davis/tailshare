package mesh

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
	"tailscale.com/types/key"
)

func TestAuditSilentPrefixDoesNotBlockAccept(t *testing.T) {
	relay := tailcattest.LocalDERP(t)
	host, joiner := localMesh(t, relay, "Host"), localMesh(t, relay, "Joiner")
	links := prepareJoin(t, host, joiner)
	link := links[host.Self().ID]
	accepted := make(chan net.Conn, 1)
	go func() { _, conn, _ := host.Accept(); accepted <- conn }()
	for range 3 {
		conn, err := link.client.DialTCPPort(t.Context(), 80)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
	}
	before := time.Now()
	outgoing, err := link.open(t.Context(), 'C')
	if err != nil {
		t.Fatal(err)
	}
	defer outgoing.Close()
	select {
	case incoming := <-accepted:
		if incoming == nil {
			t.Fatal("accept closed")
		}
		defer incoming.Close()
		if time.Since(before) > time.Second {
			t.Fatal("silent prefixes blocked real control")
		}
	case <-time.After(time.Second):
		t.Fatal("silent prefix blocked Accept")
	}
}

func TestAuditPendingControlsBounded(t *testing.T) {
	relay := tailcattest.LocalDERP(t)
	host, joiner := localMesh(t, relay, "Host"), localMesh(t, relay, "Joiner")
	link := prepareJoin(t, host, joiner)[host.Self().ID]
	go func() { _, _, _ = host.Accept() }()
	for range 50 {
		conn, err := link.open(t.Context(), 'C')
		if err != nil {
			continue
		}
		defer conn.Close()
	}
	time.Sleep(100 * time.Millisecond)
	host.mu.Lock()
	pending, held := len(host.pendingControls), len(host.incoming[joiner.Self().ID])
	host.mu.Unlock()
	if pending != 1 || held > 1 {
		t.Fatalf("held %d pending controls and %d streams", pending, held)
	}
}

func TestAuditRejectingMemberDoesNotBlockJoin(t *testing.T) {
	host := localMesh(t, nil, "Host")
	bad := member("Bad", 2)
	if err := host.SetRoster(peer.ShareRoster{Members: []peer.ShareMember{host.Self(), bad}}); err != nil {
		t.Fatal(err)
	}
	left, right := net.Pipe()
	ready := make(chan *peer.Peer, 1)
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	go func() {
		control, _ := peer.Start(ctx, left, peer.Options{DisplayName: "Host"})
		ready <- control
	}()
	remote, err := peer.Start(ctx, right, peer.Options{DisplayName: "Bad", Handlers: map[string]peer.Handler{
		peer.MethodShareAdmit: func(context.Context, json.RawMessage) (any, error) { return nil, errors.New("refuse") },
	}})
	if err != nil {
		t.Fatal(err)
	}
	defer remote.Close()
	control := <-ready
	defer control.Close()
	if err := host.RegisterPeer(bad.ID, control); err != nil {
		t.Fatal(err)
	}
	joiner := member("Good", 3)
	admission, err := host.BeginAdmission(joiner)
	if err != nil {
		t.Fatal(err)
	}
	defer admission.Close()
	links := peer.ShareLinks{Links: []peer.ShareLink{
		{ID: host.Self().ID, LinkKey: key.NewNode().Public().String()},
		{ID: bad.ID, LinkKey: key.NewNode().Public().String()},
	}}
	result, err := admission.Handlers()[peer.MethodShareLinks](ctx, raw(links))
	if err != nil {
		t.Fatal(err)
	}
	removed := result.(peer.ShareLinksResult).Removed
	roster := host.Roster().Members
	if len(removed) != 1 || removed[0] != bad.ID || len(roster) != 2 || roster[1].ID != joiner.ID {
		t.Fatalf("bad member blocked join: %+v %+v", result, roster)
	}
}

func TestAuditDuplicateNameGetsFingerprint(t *testing.T) {
	host := localMesh(t, nil, "Host")
	joiner := member("host", 0)
	admission, err := host.BeginAdmission(joiner)
	if err != nil {
		t.Fatal(err)
	}
	defer admission.Close()
	if admission.joiner.DisplayName == joiner.DisplayName {
		t.Fatal("duplicate name retained")
	}
	if admission.joiner.DisplayName != "host ("+peer.Fingerprint(joiner.ID)+")" {
		t.Fatal("suffix lacks fingerprint")
	}
}
