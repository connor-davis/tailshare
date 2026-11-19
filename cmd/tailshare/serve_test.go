package main

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

var goodToken = strings.Repeat("ab", 32)

func TestServeRefusesBadSettingsBeforeAnyOutput(t *testing.T) {
	cases := map[string][2]string{
		"missing token":  {"", "127.0.0.1:0"},
		"short token":    {"abcd", "127.0.0.1:0"},
		"non-hex token":  {strings.Repeat("zz", 32), "127.0.0.1:0"},
		"all interfaces": {goodToken, "0.0.0.0:0"},
		"other host":     {goodToken, "192.168.1.5:0"},
		"hostname":       {goodToken, "localhost:0"},
	}

	for name, setting := range cases {
		t.Setenv("TAILSHARE_TOKEN", setting[0])
		t.Setenv("TAILSHARE_ADDR", setting[1])

		var out bytes.Buffer
		if err := serve(t.Context(), strings.NewReader(""), &out); err == nil || out.Len() != 0 {
			t.Errorf("%s: err = %v, output = %q", name, err, out.String())
		}
	}
}

// running is one serve call with its pipes.
type running struct {
	base       string
	stdin      *io.PipeWriter
	done       chan error
	afterReady *bufio.Reader
}

// startServe runs serve on port 0 and waits for its ready line.
func startServe(t *testing.T, ctx context.Context) *running {
	t.Helper()

	t.Setenv("TAILSHARE_TOKEN", goodToken)
	t.Setenv("TAILSHARE_ADDR", "127.0.0.1:0")

	stdinReader, stdinWriter := io.Pipe()
	stdoutReader, stdoutWriter := io.Pipe()

	run := &running{stdin: stdinWriter, done: make(chan error, 1), afterReady: bufio.NewReader(stdoutReader)}

	go func() {
		err := serve(ctx, stdinReader, stdoutWriter)
		_ = stdoutWriter.Close()
		run.done <- err
	}()

	t.Cleanup(func() { _ = stdinWriter.Close() })

	line, err := run.afterReady.ReadString('\n')
	if err != nil {
		t.Fatalf("no ready line: %v", err)
	}

	base, found := strings.CutPrefix(strings.TrimSuffix(line, "\n"), "TAILSHARE_READY ")
	if !found || !strings.HasPrefix(base, "http://127.0.0.1:") {
		t.Fatalf("ready line = %q", line)
	}

	run.base = base

	return run
}

func (run *running) health(t *testing.T) int {
	t.Helper()

	request, err := http.NewRequest("GET", run.base+"/api/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	request.Header.Set("Authorization", "Bearer "+goodToken)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()

	return response.StatusCode
}

// stopsWithin waits for serve to return and checks it printed nothing else.
func (run *running) stopsWithin(t *testing.T, limit time.Duration) {
	t.Helper()

	select {
	case err := <-run.done:
		if err != nil {
			t.Fatalf("serve returned %v", err)
		}
	case <-time.After(limit):
		t.Fatal("serve did not stop in time")
	}

	if extra, _ := io.ReadAll(run.afterReady); len(extra) != 0 {
		t.Fatalf("extra output after the ready line: %q", extra)
	}

	// The port is free again.
	host := strings.TrimPrefix(run.base, "http://")
	if conn, err := net.DialTimeout("tcp", host, time.Second); err == nil {
		_ = conn.Close()
		t.Fatal("the port is still open after shutdown")
	}
}

func TestServeStopsWhenStdinCloses(t *testing.T) {
	run := startServe(t, t.Context())

	if got := run.health(t); got != 200 {
		t.Fatalf("health = %d", got)
	}

	_ = run.stdin.Close()
	run.stopsWithin(t, 10*time.Second)
}

func TestServeStopsOnSignal(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	run := startServe(t, ctx)

	if got := run.health(t); got != 200 {
		t.Fatalf("health = %d", got)
	}

	cancel()
	run.stopsWithin(t, 10*time.Second)
}

func TestRunKeepsOtherCommands(t *testing.T) {
	if err := run([]string{"version"}); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"env"}); err != nil {
		t.Fatal(err)
	}
	if err := run(nil); err == nil {
		t.Fatal("no command should print usage as an error")
	}
	if err := run([]string{"nonsense"}); err == nil {
		t.Fatal("an unknown command should be an error")
	}
}
