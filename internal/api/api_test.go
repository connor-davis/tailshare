package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

var testToken = strings.Repeat("ab", 32)

func TestMain(m *testing.M) {
	tailcattest.Init()
	os.Exit(m.Run())
}

// fixture is one running API on a loopback port.
type fixture struct {
	t      *testing.T
	server *Server
	base   string
	host   string
}

func newFixture(t *testing.T, cfg config.Config, transfers Transfers) *fixture {
	t.Helper()

	cfg.Token = testToken
	cfg.Addr = "127.0.0.1:0"

	server, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}

	server.transfers = transfers
	if transfers != nil {
		events, stop := transfers.Subscribe()
		go server.forwardTransfers(events, stop)
	}

	listener, err := server.Listen()
	if err != nil {
		t.Fatal(err)
	}

	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Shutdown(2 * time.Second) })

	host := listener.Addr().String()

	return &fixture{t: t, server: server, base: "http://" + host, host: host}
}

// reply is one answer, decoded.
type reply struct {
	Status int
	Header http.Header
	Raw    []byte
	Body   map[string]any
}

// send makes a request with the right token unless edit removes it.
func (f *fixture) send(method, path string, body any, edit ...func(*http.Request)) reply {
	f.t.Helper()

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			f.t.Fatal(err)
		}

		reader = bytes.NewReader(raw)
	}

	request, err := http.NewRequest(method, f.base+path, reader)
	if err != nil {
		f.t.Fatal(err)
	}

	request.Header.Set("Authorization", "Bearer "+testToken)
	for _, change := range edit {
		change(request)
	}

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		f.t.Fatal(err)
	}
	defer response.Body.Close()

	raw, _ := io.ReadAll(response.Body)
	out := reply{Status: response.StatusCode, Header: response.Header, Raw: raw}
	_ = json.Unmarshal(raw, &out.Body)

	return out
}

// expect fails the test unless the answer has the status and error code.
func (r reply) expect(t *testing.T, status int, code string) {
	t.Helper()

	if r.Status != status {
		t.Fatalf("status = %d, want %d (%s)", r.Status, status, r.Raw)
	}
	if code != "" && r.Body["code"] != code {
		t.Fatalf("code = %v, want %s (%s)", r.Body["code"], code, r.Raw)
	}
}

// chooseFolder points the fixture at a folder holding the named files.
func (f *fixture) chooseFolder(files ...string) string {
	f.t.Helper()

	dir := f.t.TempDir()

	// Cleanups run last-in first-out, so this closes the folder before it is removed.
	f.t.Cleanup(f.server.closeFolder)

	for _, name := range files {
		full := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			f.t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(name), 0o644); err != nil {
			f.t.Fatal(err)
		}
	}

	f.send(http.MethodPut, "/api/folder", map[string]string{"path": dir}).expect(f.t, 200, "")

	return dir
}

// connectPipe makes the fixture look connected to a fake computer that
// shares remoteFiles, without a network. It returns the fake's own peer.
func (f *fixture) connectPipe(remoteFiles ...string) *peer.Peer {
	f.t.Helper()

	remoteDir := f.t.TempDir()
	for _, name := range remoteFiles {
		if err := os.WriteFile(filepath.Join(remoteDir, name), []byte(name), 0o644); err != nil {
			f.t.Fatal(err)
		}
	}

	remoteRoot, err := share.Open(remoteDir)
	if err != nil {
		f.t.Fatal(err)
	}
	f.t.Cleanup(func() { _ = remoteRoot.Close() })

	f.server.mu.Lock()
	root := f.server.root
	f.server.mu.Unlock()

	left, right := net.Pipe()
	started := make(chan *peer.Peer, 1)
	go func() {
		other, err := peer.Start(f.t.Context(), right, peer.Options{DisplayName: "Fake", Share: remoteRoot})
		if err != nil {
			f.t.Error(err)
		}

		started <- other
	}()

	local, err := peer.Start(f.t.Context(), left, peer.Options{DisplayName: "Local", Share: root})
	if err != nil {
		f.t.Fatal(err)
	}

	other := <-started
	f.t.Cleanup(func() { _ = local.Close(); _ = other.Close() })

	f.server.mu.Lock()
	f.server.peer = local
	f.server.phase = phaseConnected
	f.server.role = roleJoiner
	f.server.mu.Unlock()

	return other
}
