package tailshare

import (
	"context"
	"encoding/json"
	"errors"
	"path"
	"path/filepath"
	"strings"

	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/services/transfer"
)

// ponytail: a download cannot resume after the app restarts. The manager renames a
// repeat download to "name (2)" because the old partial blocks the name (see
// share.AvailableName). Pause and resume inside one session, and uploads, do resume.
// Upgrade path: remember the job's file name and skip the rename for a known partial.

var (
	errNotJoined     = errors.New("This phone is not connected.")
	errNoTransfers   = errors.New("File transfers are not ready yet.")
	errOutsideOutbox = errors.New("That file is not in the folder this app sends from.")
)

// transferEvent is the progress JSON the screen reads.
type transferEvent struct {
	Type      string `json:"type"`
	ID        string `json:"id"`
	Name      string `json:"name"`
	Direction string `json:"direction"`
	State     string `json:"state"`
	Done      int64  `json:"done"`
	Size      int64  `json:"size"`
	Reason    string `json:"reason"`
}

// transfers is the phone's side of the queue: one manager and the two folders it uses.
type transfers struct {
	manager      *transfer.Manager
	outbox       string
	roots        []*share.Root
	subscription *transfer.Subscription
	// pending holds a snapshot being replayed one item per NextTransferEvent call.
	pending []transfer.Transfer
}

// EnableTransfers starts file transfers on a joined phone. Files to send must sit under
// outboxDir; finished downloads land in downloadDir. Call it once, after Join.
func (client *Client) EnableTransfers(outboxDir, downloadDir string) error {
	client.mu.Lock()
	joined := client.session
	already := client.transfers != nil
	client.mu.Unlock()
	if joined == nil {
		return errNotJoined
	}
	if already {
		return errors.New("File transfers are already on.")
	}

	members := joined.Members()
	if len(members) == 0 {
		return errors.New("The room has closed.")
	}

	// The host is first in the roster.
	control, ok := joined.Control(members[0].ID)
	tunnel, tunnelOK := joined.Tunnel(members[0].ID)
	if !ok || !tunnelOK {
		return errors.New("The host is not reachable.")
	}

	outbox, err := share.Open(outboxDir)
	if err != nil {
		return err
	}
	downloads, err := share.Open(downloadDir)
	if err != nil {
		_ = outbox.Close()
		return err
	}

	manager := transfer.New(outbox)
	manager.SetDownloadRoot(downloads)
	if err := manager.Attach(context.Background(), tunnel, control, false); err != nil {
		_ = outbox.Close()
		_ = downloads.Close()
		return err
	}

	client.mu.Lock()
	client.transfers = &transfers{
		manager: manager,
		outbox:  filepath.Clean(outboxDir),
		roots:   []*share.Root{outbox, downloads},
	}
	client.mu.Unlock()

	return nil
}

// transferManager returns the running transfer manager or an error.
func (client *Client) transferManager() (*transfer.Manager, error) {
	client.mu.Lock()
	defer client.mu.Unlock()
	if client.transfers == nil {
		return nil, errNoTransfers
	}

	return client.transfers.manager, nil
}

// Download queues one host file (a slash path inside the shared folder) and returns the
// transfer id. It saves into the downloads folder given to EnableTransfers.
func (client *Client) Download(remote string) (string, error) {
	if _, err := share.Localize(remote); err != nil || remote == "" {
		return "", share.ErrBadPath
	}

	manager, err := client.transferManager()
	if err != nil {
		return "", err
	}

	item, err := manager.Download(context.Background(), remote, path.Base(remote))
	if err != nil {
		return "", err
	}

	return item.ID, nil
}

// Upload queues one phone file for the host's folder remoteDir (empty is the shared folder
// itself) and returns the transfer id. localPath must be inside the outbox folder.
func (client *Client) Upload(localPath, remoteDir string) (string, error) {
	manager, err := client.transferManager()
	if err != nil {
		return "", err
	}

	client.mu.Lock()
	outbox := client.transfers.outbox
	client.mu.Unlock()

	relative, err := filepath.Rel(outbox, filepath.Clean(localPath))
	if err != nil || relative == "." || strings.HasPrefix(relative, "..") {
		return "", errOutsideOutbox
	}
	local := filepath.ToSlash(relative)

	remote := path.Join(remoteDir, path.Base(local))
	if _, err := share.Localize(remote); err != nil || remote == "" {
		return "", share.ErrBadPath
	}

	item, err := manager.Upload(context.Background(), local, remote)
	if err != nil {
		return "", err
	}

	return item.ID, nil
}

// NextTransferEvent blocks until a transfer changes and returns it as JSON:
// {"type":"transfer","id","name","direction","state","done","size","reason"}. When the
// link ends it returns {"type":"closed"} once, then an error. Call it in a loop on a
// background thread. Leave makes a blocked call return.
func (client *Client) NextTransferEvent() (string, error) {
	for {
		client.mu.Lock()
		state := client.transfers
		if state == nil {
			client.mu.Unlock()
			return "", errNoEvents
		}
		manager := state.manager

		// Replay the snapshot of a fresh subscription, so nothing dropped is lost.
		if len(state.pending) > 0 {
			item := state.pending[0]
			state.pending = state.pending[1:]
			client.mu.Unlock()
			return encodeTransfer(item), nil
		}
		if state.subscription == nil {
			state.subscription = manager.Subscribe()
			state.pending = state.subscription.Snapshot
			client.mu.Unlock()
			continue
		}
		subscription := state.subscription
		client.mu.Unlock()

		for event := range subscription.Events {
			if event.Kind == "update" && event.Transfer != nil {
				return encodeTransfer(*event.Transfer), nil
			}
		}

		// The channel closes when the manager stops or this reader fell behind.
		subscription.Close()
		select {
		case <-manager.Done():
			client.closeTransfers()
			return `{"type":"closed"}`, nil
		default:
		}

		client.mu.Lock()
		if client.transfers == state {
			state.subscription = nil
		}
		client.mu.Unlock()
	}
}

// encodeTransfer turns one queue snapshot into the screen's JSON.
func encodeTransfer(item transfer.Transfer) string {
	body, _ := json.Marshal(transferEvent{
		Type: "transfer", ID: item.ID, Name: item.Name, Direction: string(item.Direction),
		State: string(item.State), Done: item.Bytes, Size: item.Size, Reason: item.Reason,
	})

	return string(body)
}

// closeTransfers stops the manager and closes its folders. Calling it again is safe.
func (client *Client) closeTransfers() {
	client.mu.Lock()
	state := client.transfers
	client.transfers = nil
	client.mu.Unlock()
	if state == nil {
		return
	}

	_ = state.manager.Close()
	for _, root := range state.roots {
		_ = root.Close()
	}
}
