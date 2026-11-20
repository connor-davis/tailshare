package mesh

import (
	"context"
	"io"
	"net"
	"testing"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/services/peer"
	"github.com/Polyphron-AI/tailshare/internal/testsupport/tailcattest"
	"tailscale.com/tailcfg"
	"tailscale.com/types/key"
)

func localMesh(t *testing.T, relay *tailcfg.DERPMap, name string) *Mesh {
	t.Helper()
	if relay == nil {
		relay = tailcattest.LocalDERP(t)
	}
	mesh, err := New(t.Context(), Options{
		DisplayName: name, RegionID: tailcattest.RegionID,
		Region: relay.Regions[tailcattest.RegionID],
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mesh.Close() })
	return mesh
}

func prepareJoin(t *testing.T, host, joiner *Mesh) map[string]*Link {
	t.Helper()
	admission, err := host.BeginAdmission(joiner.Self())
	if err != nil {
		t.Fatal(err)
	}
	defer admission.Close()

	handlers := admission.Handlers()
	result, err := handlers[peer.MethodShareRoster](t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := joiner.SetRoster(result.(peer.ShareRoster)); err != nil {
		t.Fatal(err)
	}

	links := make(map[string]*Link)
	payload := peer.ShareLinks{}
	for _, member := range host.Roster().Members {
		link, err := NewLink(member.Address)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = link.Close() })
		links[member.ID] = link
		payload.Links = append(payload.Links, peer.ShareLink{
			ID: member.ID, LinkKey: link.PublicKey(),
		})
	}
	if _, err := handlers[peer.MethodShareLinks](t.Context(), raw(payload)); err != nil {
		t.Fatal(err)
	}
	return links
}

func connectControl(t *testing.T, dialer, acceptor *Mesh, link *Link) (*peer.Peer, *peer.Peer) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
	defer cancel()

	outgoing, err := dialer.Dial(ctx, acceptor.Self().ID, link)
	if err != nil {
		t.Fatal(err)
	}
	id, incoming, err := acceptor.Accept()
	if err != nil || id != dialer.Self().ID {
		t.Fatalf("accept = %s, %v", id, err)
	}
	type started struct {
		control *peer.Peer
		err     error
	}
	accepted := make(chan started, 1)
	go func() {
		control, err := peer.Start(ctx, incoming, peer.Options{
			DisplayName: acceptor.Self().DisplayName, Handlers: acceptor.Handlers(id),
		})
		accepted <- started{control, err}
	}()
	control, err := peer.Start(ctx, outgoing, peer.Options{
		DisplayName: dialer.Self().DisplayName, Handlers: dialer.Handlers(acceptor.Self().ID),
	})
	remote := <-accepted
	if err != nil || remote.err != nil {
		t.Fatalf("peer start: %v / %v", err, remote.err)
	}
	t.Cleanup(func() { _ = control.Close(); _ = remote.control.Close() })
	if err := dialer.RegisterPeer(acceptor.Self().ID, control); err != nil {
		t.Fatal(err)
	}
	if err := acceptor.RegisterPeer(dialer.Self().ID, remote.control); err != nil {
		t.Fatal(err)
	}
	return control, remote.control
}

func TestThreeMembersUseDistinctLinks(t *testing.T) {
	relay := tailcattest.LocalDERP(t)
	host := localMesh(t, relay, "Host")
	second := localMesh(t, relay, "Second")
	third := localMesh(t, relay, "Third")
	secondLinks := prepareJoin(t, host, second)
	secondControl, hostControl := connectControl(t, second, host, secondLinks[host.Self().ID])
	thirdLinks := prepareJoin(t, host, third)
	connectControl(t, third, host, thirdLinks[host.Self().ID])
	connectControl(t, third, second, thirdLinks[second.Self().ID])
	if thirdLinks[host.Self().ID].PublicKey() == thirdLinks[second.Self().ID].PublicKey() {
		t.Fatal("links reused a client identity")
	}
	for _, mesh := range []*Mesh{host, second, third} {
		if len(mesh.Roster().Members) != 3 {
			t.Fatal("full mesh did not learn all members")
		}
	}

	// Data streams use the same per-link tunnel and get the same identity checks.
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()

	outgoing, err := thirdLinks[host.Self().ID].Open(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer outgoing.Close()

	id, incoming, err := host.Accept()
	if err != nil || id != third.Self().ID {
		t.Fatalf("data accept = %s, %v", id, err)
	}
	defer incoming.Close()

	exchange(t, outgoing, incoming)

	subscription := hostControl.Subscribe()
	defer subscription.Close()

	if err := secondControl.Notify(peer.MethodShareLeave, peer.ShareLeave{}); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-subscription.Events:
		if err := host.HandleEvent(second.Self().ID, event); err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("leave did not reach mesh")
	}
	if err := third.Remove(second.Self().ID); err != nil {
		t.Fatal(err)
	}
	// The Host-Third data stream survives Second leaving.
	exchange(t, outgoing, incoming)
	if len(host.Roster().Members) != 2 || len(third.Roster().Members) != 2 {
		t.Fatal("leave removed unrelated membership")
	}
}

func exchange(t *testing.T, outgoing, incoming net.Conn) {
	t.Helper()
	_ = outgoing.SetDeadline(time.Now().Add(5 * time.Second))
	_ = incoming.SetDeadline(time.Now().Add(5 * time.Second))
	result := make(chan error, 1)
	go func() {
		_, err := io.WriteString(outgoing, "payload")
		result <- err
	}()
	buffer := make([]byte, 7)
	if _, err := io.ReadFull(incoming, buffer); err != nil {
		t.Fatal(err)
	}
	if err := <-result; err != nil || string(buffer) != "payload" {
		t.Fatalf("data = %q, error %v", buffer, err)
	}
}

func TestMeshLinkNeedsExpectedKey(t *testing.T) {
	host := localMesh(t, nil, "Host")
	joiner := member("Joiner", 2)
	allowed := key.NewNode()
	handler := host.Handlers(host.Self().ID)[peer.MethodShareAdmit]
	if _, err := handler(
		t.Context(),
		raw(admissionPayload(joiner, allowed.Public().String())),
	); err != nil {
		t.Fatal(err)
	}
	// Bypass the transport allowlist to prove the application refuses even an
	// authenticated Tailcat client when its key has not been expected by mesh.
	stranger := key.NewNode()
	host.server.AddAllowedClient(stranger.Public())
	client := echoClient(t, host.server, stranger)
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()

	unauthorized, err := client.DialTCPPort(ctx, 80)
	if err != nil {
		t.Fatal(err)
	}
	defer unauthorized.Close()

	accepted := make(chan string, 1)
	go func() {
		id, conn, err := host.Accept()
		if err == nil {
			_ = conn.Close()
		}
		accepted <- id
	}()
	_ = unauthorized.SetReadDeadline(time.Now().Add(time.Second))
	buffer := make([]byte, 1)
	if _, err := unauthorized.Read(buffer); err != io.EOF {
		t.Fatalf("unexpected key was not closed before peer hello: %v", err)
	}
	// A known key paired with a different source address cannot authenticate.
	host.mu.Lock()
	wrong := host.identityLocked(&net.TCPAddr{IP: net.ParseIP("fd7a:115c:a1e0::1234"), Port: 123})
	host.mu.Unlock()
	if wrong != "" {
		t.Fatal("wrong source authenticated")
	}
	listed := echoClient(t, host.server, allowed)
	conn, err := listed.DialTCPPort(ctx, 80)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	select {
	case id := <-accepted:
		if id != joiner.ID {
			t.Fatalf("accepted %s, want admitted member", id)
		}
	case <-ctx.Done():
		t.Fatal("expected link did not arrive")
	}
}

func TestRemovedKeyCannotOpenNewStreams(t *testing.T) {
	host := localMesh(t, nil, "Host")
	joiner := member("Joiner", 2)
	private := key.NewNode()
	handler := host.Handlers(host.Self().ID)[peer.MethodShareAdmit]
	if _, err := handler(
		t.Context(),
		raw(admissionPayload(joiner, private.Public().String())),
	); err != nil {
		t.Fatal(err)
	}
	client := echoClient(t, host.server, private)
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()

	outgoing, err := client.DialTCPPort(ctx, 80)
	if err != nil {
		t.Fatal(err)
	}
	defer outgoing.Close()

	_, incoming, err := host.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer incoming.Close()

	if err := host.Remove(joiner.ID); err != nil {
		t.Fatal(err)
	}
	_ = outgoing.SetReadDeadline(time.Now().Add(time.Second))
	if _, err := outgoing.Read(make([]byte, 1)); err != io.EOF {
		t.Fatalf("existing stream survived departure: %v", err)
	}
	// Tailcat still permits the key, but the app must close the new stream.
	retry, err := client.DialTCPPort(ctx, 80)
	if err != nil {
		t.Fatal(err)
	}
	defer retry.Close()

	go func() {
		_, conn, err := host.Accept()
		if err == nil {
			_ = conn.Close()
		}
	}()
	_ = retry.SetReadDeadline(time.Now().Add(time.Second))
	if _, err := retry.Read(make([]byte, 1)); err != io.EOF {
		t.Fatalf("removed key's new stream was not closed: %v", err)
	}
}

func TestNewMeshDoesNotAllowUnlistedClients(t *testing.T) {
	mesh := localMesh(t, nil, "Host")
	client := echoClient(t, mesh.server, key.NewNode())
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()

	started := time.Now()
	_, err := client.Ping(ctx)
	if err == nil || time.Since(started) < 900*time.Millisecond {
		t.Fatalf("new mesh answered an unlisted key before first admission: %v", err)
	}
}
