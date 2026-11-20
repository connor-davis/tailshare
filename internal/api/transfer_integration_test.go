package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/platform/config"
	"github.com/Polyphron-AI/tailshare/internal/services/share"
	"github.com/Polyphron-AI/tailshare/internal/services/transfer"
	"github.com/Polyphron-AI/tailshare/internal/testsupport/tailcattest"
)

func TestAPITransfersOverLocalDERP(t *testing.T) {
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}
	host, join := newFixture(t, cfg, nil), newFixture(t, cfg, nil)
	hostDir, joinDir := host.chooseFolder(), join.chooseFolder()
	// End the sessions before fixture folder cleanup releases their roots.
	t.Cleanup(func() { host.server.leave(); join.server.leave() })

	payload := bytes.Repeat([]byte("Tailshare API checksum proof.\n"), 32768)
	for _, dir := range []string{hostDir, joinDir} {
		if err := os.MkdirAll(filepath.Join(dir, "nested"), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "nested", "source.bin"), payload, 0o644); err != nil {
			t.Fatal(err)
		}
	}

	hosted := host.send("POST", "/api/session/host", nil)
	hosted.expect(t, 201, "")
	joinWithApproval(t, host, join, hosted.Body["code"].(string)).expect(t, 200, "")

	cases := []struct {
		name           string
		initiator      *fixture
		direction      string
		destination    string
		destinationDir string
	}{
		{"host upload", host, "upload", "nested/host-upload.bin", joinDir},
		{"join upload", join, "upload", "nested/join-upload.bin", hostDir},
		{"host download", host, "download", "nested/host-download.bin", hostDir},
		{"join download", join, "download", "nested/join-download.bin", joinDir},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			live := test.initiator.dialLive()
			defer live.Close()
			next(t, live)

			created := test.initiator.send("POST", "/api/transfers", TransferRequest{
				Direction: test.direction, Source: "nested/source.bin", Destination: test.destination,
			})
			created.expect(t, 202, "")
			id := created.Body["id"].(string)
			starting, progress := false, false
			for {
				event := next(t, live)
				if event.Type != "transfer.state" && event.Type != "transfer.progress" {
					continue
				}
				var item TransferItem
				if err := json.Unmarshal(mustJSON(event.Data), &item); err != nil {
					t.Fatal(err)
				}
				if item.ID != id {
					continue
				}
				starting = starting || item.State == "starting"
				progress = progress || (event.Type == "transfer.progress" && item.Bytes > 0)
				if item.State == "failed" {
					t.Fatalf("transfer failed: %+v", item)
				}
				if item.State == "done" {
					if event.Type != "transfer.state" || !starting || !progress {
						t.Fatalf("missing state/progress events: starting=%v progress=%v final=%s", starting, progress, event.Type)
					}
					if item.Source != "nested/source.bin" || item.Destination != test.destination {
						t.Fatalf("paths changed: %+v", item)
					}
					break
				}
			}

			received, err := os.ReadFile(filepath.Join(test.destinationDir, filepath.FromSlash(test.destination)))
			if err != nil {
				t.Fatal(err)
			}
			if sha256.Sum256(received) != sha256.Sum256(payload) {
				t.Fatal("received SHA-256 does not match the source")
			}

			// A new live client sees the completed transfer in its initial snapshot.
			fresh := test.initiator.dialLive()
			defer fresh.Close()
			var snapshot Snapshot
			if err := json.Unmarshal(mustJSON(next(t, fresh).Data), &snapshot); err != nil {
				t.Fatal(err)
			}
			found := false
			for _, item := range snapshot.Transfers {
				found = found || (item.ID == id && item.State == "done")
			}
			if !found {
				t.Fatalf("completed transfer missing from snapshot: %+v", snapshot)
			}
			test.initiator.send("POST", "/api/transfers/"+id+"/pause", nil).expect(t, 409, "conflict")
		})
	}

	host.send("POST", "/api/transfers", TransferRequest{
		Direction: "download", Source: "nested/source.bin", Destination: "../escape.bin",
	}).expect(t, 400, "bad_path")
	host.send("POST", "/api/transfers/unknown/pause", nil).expect(t, 404, "not_found")

	host.server.mu.Lock()
	manager := host.server.transfers.(*managedTransfers).manager
	host.server.mu.Unlock()
	host.send("DELETE", "/api/session", nil).expect(t, 200, "")
	select {
	case <-manager.Done():
	default:
		t.Fatal("session leave did not close its transfer manager")
	}
	host.send("GET", "/api/transfers", nil).expect(t, 409, "not_connected")
	if items := host.server.transferList(); len(items) != 0 {
		t.Fatalf("old session transfers survived leave: %+v", items)
	}
}

func TestTransferSubscriptionRecoversOverflow(t *testing.T) {
	root, err := share.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	adapter := newManagedTransfers(transfer.New(root))
	defer adapter.Close()
	events, stop := adapter.Subscribe()
	defer stop()

	// Without Attach these remain queued. Blocking the adapter's consumer makes
	// the manager close its 64-event subscription, just like a busy live hub can.
	var last transfer.Transfer
	for range 100 {
		last, err = adapter.manager.Upload(t.Context(), "source.bin", "destination.bin")
		if err != nil {
			t.Fatal(err)
		}
	}
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	for {
		select {
		case event := <-events:
			if event.Item.ID == last.ID {
				if event.Type != "transfer.state" || event.Item.State != "queued" {
					t.Fatalf("recovered event = %+v", event)
				}
				return
			}
		case <-timer.C:
			t.Fatal("closed subscription did not recover its latest snapshot")
		}
	}
}

func TestTransferSubscriptionStopWhileIdle(t *testing.T) {
	adapter := newManagedTransfers(transfer.New(nil))
	defer adapter.Close()
	events, stop := adapter.Subscribe()
	stop()

	select {
	case _, open := <-events:
		if open {
			t.Fatal("idle subscription emitted an event after stopping")
		}
	case <-time.After(time.Second):
		t.Fatal("stopped subscription stayed open")
	}
}

func TestManagerAdapterControlsAndNestedPaths(t *testing.T) {
	root, err := share.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	adapter := newManagedTransfers(transfer.New(root))
	defer adapter.Close()

	original, err := adapter.Enqueue(t.Context(), TransferRequest{
		Direction: "upload", Source: "local/nested.bin", Destination: "peer/renamed.bin",
	})
	if err != nil {
		t.Fatal(err)
	}
	paused, err := adapter.Pause(t.Context(), original.ID)
	if err != nil || paused.State != "paused" {
		t.Fatalf("pause = %+v, %v", paused, err)
	}
	resumed, err := adapter.Resume(t.Context(), original.ID)
	if err != nil || resumed.ID == original.ID || resumed.State != "queued" {
		t.Fatalf("resume must return the fresh attempt: %+v, %v", resumed, err)
	}
	if resumed.Source != "local/nested.bin" || resumed.Destination != "peer/renamed.bin" {
		t.Fatalf("resume paths = %+v", resumed)
	}
	canceled, err := adapter.Cancel(t.Context(), resumed.ID)
	if err != nil || canceled.State != "canceled" {
		t.Fatalf("cancel = %+v, %v", canceled, err)
	}
	_, err = adapter.Pause(t.Context(), canceled.ID)
	if mapped := toAppError(err); mapped.Status != 409 || mapped.Code != "conflict" {
		t.Fatalf("completed control error = %+v", mapped)
	}
}
