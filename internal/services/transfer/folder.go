package transfer

import (
	"context"
	"crypto/rand"
	"path"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
)

// TreeFile maps one validated peer path to a path below the received folder.
type TreeFile struct {
	Remote   string
	Relative string
}

// DownloadTree reserves a fresh folder and pins every queued file to its root.
// Single-file callers retain their separate basename-only destination rule.
func (manager *Manager) DownloadTree(
	ctx context.Context, name string, files []TreeFile, root *share.Root,
) ([]Transfer, error) {
	if root == nil || path.Base(name) != name || len(files) > share.MaxTreeFiles {
		return nil, share.ErrBadPath
	}

	if _, err := share.Localize(name); err != nil || name == "" {
		return nil, share.ErrBadPath
	}

	for _, file := range files {
		for _, wire := range []string{file.Remote, file.Relative, path.Join(name, file.Relative)} {
			if _, err := share.Localize(wire); err != nil || wire == "" {
				return nil, share.ErrBadPath
			}
		}
	}

	manager.mu.Lock()
	defer manager.mu.Unlock()

	if manager.closed || ctx.Err() != nil {
		return nil, errDropped
	}

	name, err := root.ReserveFolder(name)
	if err != nil {
		return nil, err
	}

	// Create all parents before scheduling any work. os.Root confines every mkdir.
	for _, file := range files {
		if err := root.MakeDirs(path.Dir(path.Join(name, file.Relative))); err != nil {
			return nil, err
		}
	}

	items := make([]Transfer, 0, len(files))
	for _, file := range files {
		item := manager.newJobLocked(
			rand.Text(), path.Join(name, file.Relative), file.Remote, peer.DirectionDownload, true,
		)
		item.root = root
		items = append(items, item.view)
	}

	manager.scheduleLocked()

	return items, nil
}
