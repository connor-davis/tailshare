package session

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/services/codes"
	"github.com/Polyphron-AI/tailshare/internal/services/peer"
	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

func TestJoinLineNotOverread(t *testing.T) {
	local, remote := net.Pipe()
	defer local.Close()
	defer remote.Close()
	_ = local.SetDeadline(time.Now().Add(time.Second))
	result := make(chan error, 1)
	go func() { _, err := io.WriteString(remote, "join key address\nHELLO"); result <- err }()
	line, err := readLine(local)
	if err != nil || line != "join key address" {
		t.Fatalf("line=%q, err=%v", line, err)
	}
	hello := make([]byte, 5)
	if _, err := io.ReadFull(local, hello); err != nil || string(hello) != "HELLO" {
		t.Fatalf("hello=%q, err=%v", hello, err)
	}
	if err := <-result; err != nil {
		t.Fatal(err)
	}
}

func TestJoinLineSizeBound(t *testing.T) {
	local, remote := net.Pipe()
	defer local.Close()
	defer remote.Close()
	go func() { _, _ = io.WriteString(remote, strings.Repeat("x", 4096)+"\n") }()
	if _, err := readLine(local); err == nil {
		t.Fatal("oversized line accepted")
	}
}

func TestHandshakeDeadlineCleared(t *testing.T) {
	local, remote := net.Pipe()
	defer local.Close()
	defer remote.Close()
	ctx, cancel := context.WithTimeout(t.Context(), 100*time.Millisecond)
	defer cancel()
	stop := boundHandshake(ctx, local)
	stop()
	<-ctx.Done()
	// This write happens after both the original deadline and its cancellation.
	result := make(chan error, 1)
	go func() { _, err := remote.Write([]byte{1}); result <- err }()
	_ = remote.SetWriteDeadline(time.Now().Add(time.Second))
	if _, err := io.ReadFull(local, make([]byte, 1)); err != nil {
		t.Fatal(err)
	}
	if err := <-result; err != nil {
		t.Fatal(err)
	}
}

func TestJoinLineReadCanceled(t *testing.T) {
	local, remote := net.Pipe()
	defer local.Close()
	defer remote.Close()
	ctx, cancel := context.WithCancel(t.Context())
	stop := boundHandshake(ctx, local)
	defer stop()
	cancel()
	if _, err := readLine(local); err == nil {
		t.Fatal("canceled join line succeeded")
	}
}

func admissionConn(t *testing.T, code codes.Code, options settings) (net.Conn, key.NodePrivate) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	address, err := codes.Addr(code, options.regionID).Resolve(ctx, options.derpMap)
	if err != nil {
		t.Fatal(err)
	}
	client := tailcat.NewClient(address)
	client.Key, client.Logf = key.NewNode(), quietLog
	t.Cleanup(func() { _ = client.Close() })
	conn, err := dialBootstrap(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return conn, client.Key
}

func TestJoinLineKeyMustMatchStream(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	conn, _ := admissionConn(t, code, options)
	_, _ = fmt.Fprintf(conn, "join %s %s\n", key.NewNode().Public(), host.mesh.Self().Address)
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	if _, err := conn.Read(make([]byte, 1)); err != io.EOF {
		t.Fatalf("forged claim not closed: %v", err)
	}
	if _, ok := host.Pending(); ok {
		t.Fatal("forged claim prompted")
	}
}

func TestJoinLineBadAddressRefused(t *testing.T) {
	for _, address := range []string{"../../outside", "", "not-an-address"} {
		t.Run(address, func(t *testing.T) {
			options := localSettings(t)
			host, code := startHost(t, options)
			conn, private := admissionConn(t, code, options)
			_, _ = fmt.Fprintf(conn, "join %s %s\n", private.Public(), address)
			_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
			if _, err := conn.Read(make([]byte, 1)); err != io.EOF {
				t.Fatalf("bad address not closed: %v", err)
			}
			if _, ok := host.Pending(); ok {
				t.Fatal("bad address prompted")
			}
		})
	}
}

func admissionControl(t *testing.T, host *Session, code codes.Code, options settings, address string) *peer.Peer {
	t.Helper()
	conn, private := admissionConn(t, code, options)
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	if err := writeJoinLine(ctx, conn, private.Public(), address); err != nil {
		t.Fatal(err)
	}
	control, err := peer.Start(ctx, conn, peer.Options{DisplayName: "Joiner"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = control.Close() })
	waitPending(t, host)
	return control
}

func TestDuplicateIdentityRefused(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	second := connectJoiner(t, host, code, options)
	for _, address := range []string{host.mesh.Self().Address, second.mesh.Self().Address} {
		control := admissionControl(t, host, code, options, address)
		pending, _ := host.Pending()
		assertRemoteCode(t, host.Allow(pending.ID), peer.CodeBadRequest)
		ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
		err := control.Call(ctx, peer.MethodShareRoster, nil, nil)
		cancel()
		assertRemoteCode(t, err, peer.CodeBadRequest)
		_ = control.Close()
		if len(host.Members()) != 2 {
			t.Fatal("duplicate changed roster")
		}
	}
}

func TestAdmissionFailureDropsJoiner(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	second := connectJoiner(t, host, code, options)
	third := connectJoiner(t, host, code, options)
	candidate, err := newSession(t.Context(), options, code)
	if err != nil {
		t.Fatal(err)
	}
	defer candidate.Close()
	control := admissionControl(t, host, code, options, candidate.mesh.Self().Address)
	pending, _ := host.Pending()
	if err := host.Allow(pending.ID); err != nil {
		t.Fatal(err)
	}
	var roster peer.ShareRoster
	if err := control.Call(t.Context(), peer.MethodShareRoster, nil, &roster); err != nil {
		t.Fatal(err)
	}
	// Changing membership after approval invalidates the preparation snapshot.
	_ = second.Leave()
	waitState(t, host, func() bool { return len(host.Members()) == 2 })
	payload := peer.ShareLinks{}
	for _, member := range roster.Members {
		if member.ID != candidate.mesh.Self().ID {
			payload.Links = append(
				payload.Links,
				peer.ShareLink{ID: member.ID, LinkKey: key.NewNode().Public().String()},
			)
		}
	}
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	assertRemoteCode(t, control.Call(ctx, peer.MethodShareLinks, payload, nil), peer.CodeJoinFailed)
	if len(host.Members()) != 2 || len(third.Members()) > 3 {
		t.Fatal("failed join changed membership")
	}
}

func TestHandlerCollisionRefused(t *testing.T) {
	options := localSettings(t)
	options.options.Handlers = map[string]peer.Handler{
		peer.MethodShareAdmit: func(context.Context, json.RawMessage) (any, error) { return nil, nil },
	}
	if session, _, err := host(t.Context(), options); err == nil {
		_ = session.Close()
		t.Fatal("handler collision accepted")
	}
}
