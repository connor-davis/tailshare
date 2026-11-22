package api

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/services/transfer"
)

func mainHeader(request *http.Request) {
	request.Header.Set("X-Tailshare-Main", strings.Repeat("cd", 32))
}

func TestMainOnlyFilesAndDownloads(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	for _, endpoint := range []struct{ method, path string }{
		{"POST", "/api/room/files"}, {"PUT", "/api/downloads"},
		{"POST", "/api/downloads/preview"}, {"POST", "/api/transfers/folder"},
	} {
		f.send(endpoint.method, endpoint.path, nil).expect(t, 403, "forbidden")
		f.send(endpoint.method, endpoint.path, nil, func(request *http.Request) {
			request.Header.Set("X-Tailshare-Main", "wrong")
		}).expect(t, 403, "forbidden")
		f.send(endpoint.method, endpoint.path, nil, mainHeader, func(request *http.Request) {
			request.Header.Del("Authorization")
		}).expect(t, 401, "unauthorized")
	}
	f.send("POST", "/api/room/files", map[string]any{"paths": []string{}}, mainHeader).expect(t, 409, "not_connected")
}

func TestRoomRootCanonicalReuseAndCleanup(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	code, _ := codes.Parse("7k3q 9pxm")
	root, err := f.server.reserve(roleHost, code)
	if err != nil {
		t.Fatal(err)
	}
	if root.Name() != "7K3Q-9PXM" {
		t.Fatal(root.Name())
	}
	file, err := root.Create("kept.txt")
	if err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	f.server.release()
	if _, err := root.Stat("kept.txt"); err == nil {
		t.Fatal("failed setup kept its root open")
	}
	root, err = f.server.reserve(roleJoiner, code)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := root.Stat("kept.txt"); err != nil {
		t.Fatal(err)
	}
	f.server.release()
	for _, bad := range []codes.Code{"../outside", "/outside", "C:/other", ""} {
		if _, err := f.server.openRoom(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestAddRoomFiles(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	code, _ := codes.Parse("7K3Q9PXM")
	if _, err := f.server.reserve(roleHost, code); err != nil {
		t.Fatal(err)
	}
	f.server.activeLocked().phase = phaseHosting
	sourceDir := t.TempDir()
	source := filepath.Join(sourceDir, "report.pdf")
	if err := os.WriteFile(source, []byte("abc"), 0o600); err != nil {
		t.Fatal(err)
	}
	f.send("POST", "/api/room/files", map[string]any{"paths": []string{source}, "roomCode": "8K3Q9PXM"}, mainHeader).expect(t, 409, "not_connected")
	response := f.send("POST", "/api/room/files", map[string]any{"paths": []string{source, source, sourceDir, filepath.Join(sourceDir, "missing")}, "roomCode": "7K3Q9PXM"}, mainHeader)
	response.expect(t, 200, "")
	if strings.Contains(string(response.Raw), sourceDir) || !strings.Contains(string(response.Raw), "report (2).pdf") {
		t.Fatal(string(response.Raw))
	}
	if len(response.Body["added"].([]any)) != 3 || len(response.Body["skipped"].([]any)) != 1 {
		t.Fatal(string(response.Raw))
	}
	paths := make([]string, 101)
	f.send("POST", "/api/room/files", map[string]any{"paths": paths}, mainHeader).expect(t, 400, "bad_request")
	link := filepath.Join(sourceDir, "link.pdf")
	if err := os.Symlink(source, link); err == nil {
		result := f.send("POST", "/api/room/files", map[string]any{"paths": []string{link}}, mainHeader)
		result.expect(t, 200, "")
		if len(result.Body["added"].([]any)) != 0 {
			t.Fatal("copied a link")
		}
	}
}

func TestDownloadDestinationContract(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	room := f.chooseFolder()
	downloads := t.TempDir()
	f.send("PUT", "/api/downloads", map[string]string{"folder": downloads}, mainHeader).expect(t, 200, "")
	if err := os.WriteFile(filepath.Join(downloads, "report.pdf"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	manager := transfer.New(f.server.activeLocked().root)
	manager.SetDownloadRoot(f.server.downloadRoot)
	defer manager.Close()
	f.server.activeLocked().transfers = newManagedTransfers(manager)
	f.server.activeLocked().phase = phaseConnected
	for _, destination := range []string{"sub/file.pdf", `sub\file.pdf`, "..", "../outside"} {
		f.send("POST", "/api/transfers", TransferRequest{Direction: "download", Source: "report.pdf", Destination: destination}).expect(t, 400, "bad_path")
	}
	response := f.send("POST", "/api/transfers", TransferRequest{Direction: "download", Source: "report.pdf", Destination: "report.pdf"})
	response.expect(t, 202, "")
	if response.Body["destination"] != "report (2).pdf" {
		t.Fatal(string(response.Raw))
	}
	if entries, _ := os.ReadDir(room); len(entries) != 0 {
		t.Fatal("download touched room")
	}
	// A root change must affect new downloads without redirecting the queued one.
	other := t.TempDir()
	f.server.activeLocked().manager = manager
	f.send("PUT", "/api/downloads", map[string]string{"folder": other}, mainHeader).expect(t, 200, "")
	item, err := manager.Download(context.Background(), "report.pdf", "report.pdf")
	if err != nil || item.LocalPath != "report.pdf" {
		t.Fatalf("%+v %v", item, err)
	}
}

func TestRoomAndDownloadRootsCloseOnShutdown(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	code, _ := codes.Parse("7K3Q9PXM")
	room, err := f.server.reserve(roleHost, code)
	if err != nil {
		t.Fatal(err)
	}

	for range 2 {
		folder := filepath.Join(t.TempDir(), "new", "downloads")
		f.send("PUT", "/api/downloads", map[string]string{"folder": folder}, mainHeader).expect(t, 200, "")
	}
	roots := append([]*share.Root{room}, f.server.downloadRoots...)
	if err := f.server.Shutdown(time.Second); err != nil {
		t.Fatal(err)
	}

	for _, root := range roots {
		if _, err := root.Stat(""); err == nil {
			t.Fatal("shutdown retained an open root")
		}
	}
	if _, err := os.Stat(filepath.Join(f.server.cfg.RoomsDir, code.String())); err != nil {
		t.Fatal("shutdown removed the persistent room")
	}
}
