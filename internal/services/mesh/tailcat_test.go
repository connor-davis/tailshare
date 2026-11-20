package mesh

import (
	"context"
	"fmt"
	"io"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

func TestMain(tests *testing.M) {
	tailcattest.Init()
	os.Exit(tests.Run())
}

func echoServer(t *testing.T, allowed []key.NodePublic) *tailcat.Server {
	t.Helper()
	relay := tailcattest.LocalDERP(t)
	server := &tailcat.Server{
		Key: key.NewNode(), PresharedKey: tailcat.NewPresharedKey(),
		Region: relay.Regions[tailcattest.RegionID], RegionID: tailcattest.RegionID,
		AllowedClients: allowed, Logf: quietLog,
	}
	listener, err := server.Listen(t.Context(), "tcp", ":80")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = server.Close() })
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()

				_, _ = io.Copy(conn, conn)
			}()
		}
	}()
	return server
}

func echoClient(t *testing.T, server *tailcat.Server, private key.NodePrivate) *tailcat.Client {
	t.Helper()
	client := tailcat.NewClient(server.TailcatAddr())
	client.Key = private
	client.Logf = quietLog
	t.Cleanup(func() { _ = client.Close() })
	return client
}

func echo(ctx context.Context, client *tailcat.Client, message string) error {
	conn, err := client.DialTCPPort(ctx, 80)
	if err != nil {
		return err
	}
	defer conn.Close()

	deadline, _ := ctx.Deadline()
	_ = conn.SetDeadline(deadline)

	if _, err := io.WriteString(conn, message); err != nil {
		return err
	}
	buffer := make([]byte, len(message))
	if _, err := io.ReadFull(conn, buffer); err != nil {
		return err
	}
	if string(buffer) != message {
		return fmt.Errorf("echo = %q, want %q", buffer, message)
	}
	return nil
}

func echoWithin(t *testing.T, client *tailcat.Client, timeout time.Duration) error {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), timeout)
	defer cancel()

	return echo(ctx, client, "mesh echo")
}

func TestOneServerManyClients(t *testing.T) {
	private := []key.NodePrivate{key.NewNode(), key.NewNode(), key.NewNode()}
	allowed := make([]key.NodePublic, len(private))
	for i, node := range private {
		allowed[i] = node.Public()
	}
	server := echoServer(t, allowed)
	var waiting sync.WaitGroup
	failures := make(chan error, len(private))
	for _, node := range private {
		client := echoClient(t, server, node)
		waiting.Go(func() { failures <- echoWithin(t, client, 15*time.Second) })
	}
	waiting.Wait()
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
}

func TestNewClientRefusedBeforeAllowlist(t *testing.T) {
	listed := key.NewNode()
	server := echoServer(t, []key.NodePublic{listed.Public()})
	if err := echoWithin(t, echoClient(t, server, listed), 15*time.Second); err != nil {
		t.Fatal(err)
	}
	private := key.NewNode()
	client := echoClient(t, server, private)
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	started := time.Now()
	_, err := client.Ping(ctx)
	cancel()
	if err == nil || time.Since(started) < 900*time.Millisecond {
		t.Fatalf("unlisted Ping should stay silent until deadline: %v", err)
	}
	started = time.Now()
	if err := echoWithin(t, client, time.Second); err == nil ||
		time.Since(started) < 900*time.Millisecond {
		t.Fatalf("unlisted dial should stay silent until deadline: %v", err)
	}

	server.AddAllowedClient(private.Public())
	if err := echoWithin(t, client, 15*time.Second); err != nil {
		t.Fatalf("same client did not recover after allow: %v", err)
	}
	_ = client.Close()
	if err := echoWithin(t, echoClient(t, server, private), 15*time.Second); err != nil {
		t.Fatalf("fresh allowed client: %v", err)
	}
}

func TestSameKeyTwoClientsSpike(t *testing.T) {
	private := key.NewNode()
	server := echoServer(t, []key.NodePublic{private.Public()})
	first := echoClient(t, server, private)
	if err := echoWithin(t, first, 15*time.Second); err != nil {
		t.Fatalf("first alone: %v", err)
	}
	second := echoClient(t, server, private)
	// Tailcat is deliberately unreliable here. Do not assert which duplicate wins.
	secondStart := echoWithin(t, second, 3*time.Second)
	t.Logf("second starts: %v", secondStart)
	successes := [2]int{}
	for round := 0; round < 3; round++ {
		var waiting sync.WaitGroup
		for i, client := range []*tailcat.Client{first, second} {
			waiting.Go(func() {
				if err := echoWithin(t, client, time.Second); err == nil {
					successes[i]++
				}
			})
		}
		waiting.Wait()
	}
	t.Logf("duplicate-key successes: first %d/3, second %d/3", successes[0], successes[1])
	if successes[0]+successes[1] == 0 {
		t.Fatal("neither duplicate worked; the local relay may be broken")
	}
	if successes[0] == 3 && successes[1] == 3 {
		t.Fatal("both duplicates worked reliably; revisit the one-key-per-link assumption")
	}
}
