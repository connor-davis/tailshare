package transfer

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
)

func hashFile(file *os.File) (string, int64, error) {
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", 0, err
	}
	digest := sha256.New()
	size, err := io.Copy(digest, file)
	return hex.EncodeToString(digest.Sum(nil)), size, err
}

func (manager *Manager) prepareSender(item *job) error {
	file, err := manager.root.OpenRead(item.local)
	if err != nil {
		return err
	}
	defer file.Close()
	hash, size, err := hashFile(file)
	if err != nil {
		return errors.New("The file could not be read.")
	}
	if size > maxFileSize {
		return errors.New("That file is too large to transfer.")
	}
	manager.mu.Lock()
	item.hash, item.view.Size = hash, size
	manager.mu.Unlock()
	return nil
}

func (manager *Manager) send(item *job, destination io.Writer) error {
	file, err := manager.root.OpenRead(item.local)
	if err != nil {
		return err
	}
	defer file.Close()
	manager.mu.Lock()
	offset, size := item.view.Offset, item.view.Size
	manager.mu.Unlock()
	if _, err := file.Seek(offset, io.SeekStart); err != nil {
		return errInvalid
	}
	_, err = io.CopyN(progressWriter{destination, manager, item}, file, size-offset)
	if err != nil {
		if err == io.EOF {
			return errors.New("The file changed while sending.")
		}
		return errDropped
	}
	return nil
}

type progressWriter struct {
	writer  io.Writer
	manager *Manager
	item    *job
}

func (writer progressWriter) Write(bytes []byte) (int, error) {
	count, err := writer.writer.Write(bytes)
	writer.manager.progress(writer.item, count)
	return count, err
}
