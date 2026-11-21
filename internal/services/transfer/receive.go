package transfer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"hash"
	"io"

	"github.com/connor-davis/tailshare/internal/services/share"
)

func (manager *Manager) prepareReceiver(item *job) error {
	if _, err := manager.receiverRoot(item).Stat(item.local); err == nil {
		return share.ErrExists
	} else if !errors.Is(err, share.ErrNotFound) {
		return err
	}
	offset, err := manager.receiverRoot(item).PartialSize(item.local)
	if err != nil {
		return err
	}
	manager.mu.Lock()
	size := item.view.Size
	manager.mu.Unlock()
	available, err := manager.freeSpace(manager.receiverRoot(item))
	if err != nil {
		return share.ErrDenied
	}
	manager.mu.Lock()
	needed := max(0, size-offset)
	for _, other := range manager.jobs {
		if other != item && other.working && !other.sender {
			needed += max(0, other.view.Size-other.view.Bytes)
		}
	}
	manager.mu.Unlock()
	if available < 64<<20 || needed > available-(64<<20) {
		return errors.New("There is not enough free space for this file.")
	}
	owner := "local"
	if manager.peer != nil {
		owner = manager.peer.MemberID()
	}
	if err := manager.receiverRoot(item).ClaimPartial(item.local, owner, item.hash, size); err != nil {
		return err
	}
	if offset > size {
		return share.ErrDenied
	}

	// A resumed partial must match the checkpoint saved when it stopped. Anything else
	// (edited, no checkpoint) is thrown away and the file starts again from zero.
	sum, err := manager.checkPrefix(item, offset)
	if err != nil {
		return err
	}
	if sum == nil {
		offset = 0
		if err := manager.receiverRoot(item).ClaimPartial(item.local, owner, item.hash, size); err != nil {
			return err
		}
		sum = &prefixSum{hash: sha256.New()}
	}
	manager.mu.Lock()
	item.view.Offset, item.view.Bytes = offset, offset
	item.prefix = sum
	manager.mu.Unlock()
	return nil
}

// prefixSum hashes the bytes written to a partial, so a checkpoint costs no extra read.
type prefixSum struct {
	hash hash.Hash
	n    int64
}

func (sum *prefixSum) Write(bytes []byte) (int, error) {
	sum.n += int64(len(bytes))
	return sum.hash.Write(bytes)
}

// checkPrefix re-reads the first offset bytes of a partial and compares them with the saved
// checkpoint. It returns nil when the partial cannot be trusted and has been removed.
func (manager *Manager) checkPrefix(item *job, offset int64) (*prefixSum, error) {
	root := manager.receiverRoot(item)
	if offset == 0 {
		return &prefixSum{hash: sha256.New()}, nil
	}

	savedSize, savedHash := root.PartialPrefix(item.local)
	if savedSize != offset || savedHash == "" {
		return nil, root.RemovePartial(item.local)
	}

	file, err := root.ReadPartial(item.local)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	sum := &prefixSum{hash: sha256.New()}
	if _, err := io.Copy(sum, io.LimitReader(contextReader{item.ctx, file}, offset)); err != nil {
		return nil, errors.New("The file could not be checked.")
	}
	if sum.n != offset || hex.EncodeToString(sum.hash.Sum(nil)) != savedHash {
		return nil, root.RemovePartial(item.local)
	}
	return sum, nil
}

// saveCheckpoint records what a stopped partial holds so the next resume can check it.
func (manager *Manager) saveCheckpoint(item *job) {
	manager.mu.Lock()
	sum := item.prefix
	manager.mu.Unlock()
	root := manager.receiverRoot(item)
	size, err := root.PartialSize(item.local)
	if sum == nil || err != nil || size == 0 || sum.n != size {
		return
	}
	_ = root.SavePartialPrefix(item.local, size, hex.EncodeToString(sum.hash.Sum(nil)))
}

func receiveTo(root *share.Root, name string, offset, size int64, source io.Reader) error {
	if offset < 0 || size < offset || size > maxFileSize {
		return errInvalid
	}
	file, err := root.OpenPartial(name, offset)
	if err != nil {
		return err
	}
	_, copyError := io.CopyN(file, source, size-offset)
	closeError := file.Close()
	if copyError != nil {
		return errDropped
	}
	if closeError != nil {
		return errors.New("The file could not be saved.")
	}
	return nil
}

func verifyPartial(root *share.Root, name, expected string) error {
	return verifyPartialContext(context.Background(), root, name, expected)
}

func verifyPartialContext(ctx context.Context, root *share.Root, name, expected string) error {
	file, err := root.ReadPartial(name)
	if err != nil {
		return err
	}
	hash, _, readError := hashFileContext(ctx, file)
	closeError := file.Close()
	if readError != nil || closeError != nil {
		return errors.New("The file could not be checked.")
	}
	if hash != expected {
		_ = root.RemovePartial(name)
		return errChecksum
	}
	return nil
}

func verifyAndCommit(root *share.Root, name, expected string) error {
	if err := verifyPartial(root, name, expected); err != nil {
		return err
	}
	if err := root.Commit(name); err != nil {
		return err
	}
	return nil
}

type progressReader struct {
	reader  io.Reader
	manager *Manager
	item    *job
}

func (reader progressReader) Read(bytes []byte) (int, error) {
	count, err := reader.reader.Read(bytes)
	reader.manager.progress(reader.item, count)
	reader.manager.download.wait(reader.item.ctx, count)
	return count, err
}
