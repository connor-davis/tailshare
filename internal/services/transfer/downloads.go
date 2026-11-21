package transfer

import (
	"strings"

	"github.com/connor-davis/tailshare/internal/services/share"
)

// SetDownloadRoot changes future downloads; queued and resumed jobs keep their root.
// The caller keeps every supplied root open until the manager closes.
func (manager *Manager) SetDownloadRoot(root *share.Root) {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	manager.downloadRoot = root
	manager.renameDownloads = true
}

func (manager *Manager) receiverRoot(item *job) *share.Root {
	if item.root != nil {
		return item.root
	}
	return manager.root
}

func (manager *Manager) downloadBusyLocked(root *share.Root, local string) bool {
	for _, item := range manager.jobs {
		if !item.sender && item.root == root &&
			item.view.State != Canceled && strings.EqualFold(item.local, local) {
			return true
		}
	}
	return false
}

// PinsRoot reports whether a root is still needed by active or resumable work.
func (manager *Manager) PinsRoot(root *share.Root) bool {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.downloadRoot == root {
		return true
	}
	for _, item := range manager.jobs {
		if item.root == root && (item.working || item.view.State == Queued ||
			item.view.State == Paused || item.view.State == Failed) {
			return true
		}
	}
	return false
}
