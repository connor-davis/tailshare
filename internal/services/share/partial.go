package share

import (
	"errors"
	"io/fs"
	"os"
	"strings"
)

func (shared *Root) partialName(wire string) (string, error) {
	local, err := Localize(wire)
	if err != nil || local == "." {
		return "", ErrBadPath
	}

	return local + PartialSuffix, nil
}

// PartialSize returns the unfinished file's size, or zero when it is missing.
func (shared *Root) PartialSize(wire string) (int64, error) {
	local, err := shared.partialName(wire)
	if err != nil {
		return 0, err
	}

	info, err := shared.root.Lstat(local)
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, mapError(err)
	}
	if !info.Mode().IsRegular() {
		return 0, ErrDenied
	}

	return info.Size(), nil
}

// OpenPartial opens an unfinished file and positions it at a checked offset.
func (shared *Root) OpenPartial(wire string, offset int64) (*os.File, error) {
	local, err := shared.partialName(wire)
	if err != nil {
		return nil, err
	}

	size, err := shared.PartialSize(wire)
	if err != nil {
		return nil, err
	}
	if offset < 0 || offset > size {
		return nil, ErrBadPath
	}

	file, err := shared.root.OpenFile(local, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, mapError(err)
	}
	if err := file.Truncate(offset); err != nil {
		_ = file.Close()
		return nil, mapError(err)
	}
	if _, err := file.Seek(offset, 0); err != nil {
		_ = file.Close()
		return nil, mapError(err)
	}

	return file, nil
}

// ReadPartial opens an unfinished regular file for checksum verification.
func (shared *Root) ReadPartial(wire string) (*os.File, error) {
	local, err := shared.partialName(wire)
	if err != nil {
		return nil, err
	}
	if _, err := shared.PartialSize(wire); err != nil {
		return nil, err
	}

	file, err := shared.root.Open(local)
	if err != nil {
		return nil, mapError(err)
	}

	return file, nil
}

// Commit publishes an unfinished file without ever replacing an existing name.
func (shared *Root) Commit(wire string) error {
	partial, err := shared.partialName(wire)
	if err != nil {
		return err
	}
	if _, err := shared.PartialSize(wire); err != nil {
		return err
	}

	local, _ := Localize(wire)
	link := shared.root.Link
	if shared.link != nil {
		link = shared.link
	}
	if err := link(partial, local); err != nil {
		if errors.Is(err, fs.ErrExist) {
			return ErrExists
		}

		// Reserve the final name exclusively before using rename on volumes without links.
		// Other Tailshare workers see the reservation and cannot replace this name.
		target, createError := shared.root.OpenFile(local, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if createError != nil {
			return mapError(createError)
		}
		if closeError := target.Close(); closeError != nil {
			return ErrDenied
		}
		if renameError := shared.root.Rename(partial, local); renameError != nil {
			_ = shared.root.Remove(local)
			return ErrDenied
		}
		_ = shared.root.Remove(local + ".meta" + PartialSuffix)
		return nil
	}

	if err := shared.root.Remove(partial); err != nil {
		return mapError(err)
	}

	_ = shared.root.Remove(local + ".meta" + PartialSuffix)
	return nil
}

// RemovePartial deletes an unfinished file, ignoring a missing file.
func (shared *Root) RemovePartial(wire string) error {
	local, err := shared.partialName(wire)
	if err != nil {
		return err
	}

	_ = shared.root.Remove(strings.TrimSuffix(local, PartialSuffix) + ".meta" + PartialSuffix)
	err = shared.root.Remove(local)
	if err == nil || errors.Is(err, fs.ErrNotExist) {
		return nil
	}

	return mapError(err)
}
