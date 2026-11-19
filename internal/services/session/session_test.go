package session

import (
	"context"
	"errors"
	"io"
	"net"
	"os"
	"testing"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/platform/config"
	"github.com/Polyphron-AI/tailshare/internal/services/codes"
	"github.com/Polyphron-AI/tailshare/internal/testsupport/tailcattest"
	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

func TestMain(m *testing.M) {
	tailcattest.Init()

	os.Exit(m.Run())
}

func localSettings(t *testing.T) settings {
	t.Helper()
	derpMap := tailcattest.LocalDERP(t)
	return settings{
		regionID: tailcattest.RegionID, region: derpMap.Regions[tailcattest.RegionID],
		derpMap: derpMap, expiry: 10 * time.Minute,
	}
}

func startHost(t *testing.T, options settings) (*Session, codes.Code) {
	t.Helper()
	session, code, err := host(t.Context(), options)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return session, code
}

func connectJoiner(t *testing.T, code codes.Code, options settings) *Session {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	session, err := join(ctx, code.String(), options)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = session.Close() })
	return session
}

func TestHostJoinRekey(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	joiner := connectJoiner(t, code, options)

	for i := 0; i < 2; i++ {
		outgoing, err := joiner.Open(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		incoming, err := host.Accept()
		if err != nil {
			t.Fatal(err)
		}

		host.mu.Lock()
		peer, ok := peerKey(host.server, incoming.RemoteAddr())
		status, authenticated := host.server.Status().Peer[joiner.client.PublicKey()]
		host.mu.Unlock()
		if !authenticated {
			t.Fatal("Status().Peer did not contain the admitted joiner's key")
		}
		if len(status.TailscaleIPs) != 0 && (!ok || peer != joiner.client.PublicKey()) {
			t.Fatal("Status().Peer did not identify the joiner by its Tailscale IP")
		}

		exchange(t, outgoing, incoming, "hello host")
		exchange(t, incoming, outgoing, "hello joiner")
		_ = outgoing.Close()
		_ = incoming.Close()
	}

	if err := host.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := host.Accept(); !errors.Is(err, net.ErrClosed) {
		t.Fatalf("Accept after Close: %v", err)
	}
	if err := host.Close(); err != nil {
		t.Fatal(err)
	}
}

func exchange(t *testing.T, sender, receiver net.Conn, message string) {
	t.Helper()
	_ = sender.SetDeadline(time.Now().Add(5 * time.Second))
	_ = receiver.SetDeadline(time.Now().Add(5 * time.Second))
	written := make(chan error, 1)
	go func() {
		_, err := io.WriteString(sender, message)
		written <- err
	}()

	buffer := make([]byte, len(message))
	if _, err := io.ReadFull(receiver, buffer); err != nil {
		t.Fatal(err)
	}
	if string(buffer) != message {
		t.Fatalf("received %q, want %q", buffer, message)
	}
	if err := <-written; err != nil {
		t.Fatal(err)
	}
}

func TestOldAddressRefusedAfterRekey(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	joiner := connectJoiner(t, code, options)

	// Drain the first application stream so the new listener can accept more streams.
	stream, err := host.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Close()

	// The ack is sent before Join returns; wait for the host to retire its old server.
	select {
	case <-host.bootstrapDone:
	case <-time.After(5 * time.Second):
		t.Fatal("bootstrap server was not retired")
	}

	address, err := codes.Addr(code, 1).Resolve(t.Context(), options.derpMap)
	if err != nil {
		t.Fatal(err)
	}
	client := tailcat.NewClient(address)
	client.Key = key.NewNode()
	client.Logf = quietLog
	defer client.Close()

	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	if conn, err := client.DialTCPPort(ctx, sessionPort); err == nil {
		_ = conn.Close()
		t.Fatal("old code still accepted a new client")
	}

	// The new address must also refuse a different identity, even if it knows the address.
	intruder := tailcat.NewClient(joiner.client.Server)
	intruder.Key = key.NewNode()
	intruder.Logf = quietLog
	defer intruder.Close()
	ctx, cancel = context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	if conn, err := intruder.DialTCPPort(ctx, sessionPort); err == nil {
		_ = conn.Close()
		t.Fatal("rekeyed server accepted a different identity")
	}
}

func TestSecondJoinerRejected(t *testing.T) {
	options := localSettings(t)
	_, code := startHost(t, options)
	_ = connectJoiner(t, code, options)

	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	if session, err := join(ctx, code.String(), options); err == nil {
		_ = session.Close()
		t.Fatal("second joiner was admitted")
	}
}

func TestCodeExpires(t *testing.T) {
	options := localSettings(t)
	options.expiry = 500 * time.Millisecond
	host, code := startHost(t, options)

	select {
	case <-host.done:
	case <-time.After(3 * time.Second):
		t.Fatal("unused code did not expire")
	}
	if _, err := host.Accept(); !errors.Is(err, net.ErrClosed) {
		t.Fatalf("Accept after expiry: %v", err)
	}

	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	if session, err := join(ctx, code.String(), options); err == nil {
		_ = session.Close()
		t.Fatal("expired code admitted a joiner")
	}
}

func TestRekeyAddrDiffers(t *testing.T) {
	options := localSettings(t)
	_, code := startHost(t, options)
	joiner := connectJoiner(t, code, options)
	oldInfo, err := tailcat.ParseAddr(codes.Addr(code, 1))
	if err != nil {
		t.Fatal(err)
	}
	newInfo, err := tailcat.ParseAddr(joiner.client.Server)
	if err != nil {
		t.Fatal(err)
	}

	if oldInfo.ServerPublic == newInfo.ServerPublic || oldInfo.PresharedKey == newInfo.PresharedKey {
		t.Fatal("rekey did not replace both the node key and pre-shared key")
	}
}

func TestJoinBadCode(t *testing.T) {
	if _, err := Join(t.Context(), "nope", config.Config{}); !errors.Is(err, codes.ErrInvalid) {
		t.Fatalf("Join invalid code: %v", err)
	}
}

func TestCompetingJoiners(t *testing.T) {
	options := localSettings(t)
	_, code := startHost(t, options)
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	results := make(chan *Session, 2)
	start := make(chan struct{})

	for i := 0; i < 2; i++ {
		go func() {
			<-start
			session, _ := join(ctx, code.String(), options)
			results <- session
		}()
	}
	close(start)

	admitted := 0
	for i := 0; i < 2; i++ {
		if session := <-results; session != nil {
			admitted++
			_ = session.Close()
		}
	}
	if admitted != 1 {
		t.Fatalf("admitted %d competing joiners, want 1", admitted)
	}
}

func TestAdmissionStopsExpiry(t *testing.T) {
	options := localSettings(t)
	options.expiry = 2 * time.Second
	host, code := startHost(t, options)
	joiner := connectJoiner(t, code, options)

	select {
	case <-host.done:
		t.Fatal("admitted session closed when its code expired")
	case <-time.After(options.expiry):
	}

	outgoing, err := joiner.Open(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer outgoing.Close()
	incoming, err := host.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer incoming.Close()
	exchange(t, outgoing, incoming, "still connected")
}

func TestHostContextClosesSession(t *testing.T) {
	options := localSettings(t)
	ctx, cancel := context.WithCancel(t.Context())
	host, _, err := host(ctx, options)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	defer host.Close()
	cancel()

	select {
	case <-host.done:
	case <-time.After(3 * time.Second):
		t.Fatal("canceling the host context did not close its listener")
	}
}

func TestRekeyReadCanceled(t *testing.T) {
	local, remote := net.Pipe()
	defer local.Close()
	defer remote.Close()
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	if session, err := rekeyJoin(ctx, local, key.NewNode()); err == nil {
		_ = session.Close()
		t.Fatal("canceled bootstrap handshake succeeded")
	}
}
