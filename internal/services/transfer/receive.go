package transfer

import (
	"errors"
	"io"

	"github.com/connor-davis/tailshare/internal/services/share"
)

func (manager *Manager) prepareReceiver(item *job) error {
	if _, err := manager.root.Stat(item.local); err == nil {
		return share.ErrExists
	} else if !errors.Is(err, share.ErrNotFound) {
		return err
	}
	offset, err := manager.root.PartialSize(item.local)
	if err != nil {
		return err
	}
	manager.mu.Lock()
	size := item.view.Size
	manager.mu.Unlock()
	if offset > size {
		if err := manager.root.RemovePartial(item.local); err != nil {
			return err
		}
		offset = 0
	}
	// ponytail: resume trusts the prefix size; add a prefix hash to transfer.resume later.
	manager.mu.Lock()
	item.view.Offset, item.view.Bytes = offset, offset
	manager.mu.Unlock()
	return nil
}

func receiveTo(root *share.Root, name string, offset, size int64, source io.Reader) error {
	if offset < 0 || size < offset || size > maxFileSize {
		return errInvalid
	}
	// ponytail: disk space is checked by writes; add a free-space preflight later.
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
	file, err := root.ReadPartial(name)
	if err != nil {
		return err
	}
	hash, _, readError := hashFile(file)
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
		_ = root.RemovePartial(name)
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
	return count, err
}
