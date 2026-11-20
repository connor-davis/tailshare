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

func (manager *Manager) downloadBusyLocked(local string) bool {
	for _, item := range manager.jobs {
		if !item.sender && item.root == manager.downloadRoot &&
			item.view.State != Canceled && strings.EqualFold(item.local, local) {
			return true
		}
	}
	return false
}
