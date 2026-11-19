package share

import (
	"os"
)

// OpenRead opens a file for reading. A folder is refused so a download never
// starts on something that has no bytes.
func (shared *Root) OpenRead(wire string) (*os.File, error) {
	local, err := Localize(wire)
	if err != nil {
		return nil, err
	}

	file, err := shared.root.Open(local)
	if err != nil {
		return nil, mapError(err)
	}

	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, mapError(err)
	}
	if info.IsDir() {
		_ = file.Close()
		return nil, ErrNotFile
	}

	return file, nil
}

// Create makes a new file for writing. It never overwrites: if the name is
// taken it fails with ErrExists, so an upload cannot replace a file by
// surprise. The folder it goes in must already exist.
func (shared *Root) Create(wire string) (*os.File, error) {
	local, err := Localize(wire)
	if err != nil || local == "." {
		return nil, ErrBadPath
	}

	file, err := shared.root.OpenFile(local, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return nil, mapError(err)
	}

	return file, nil
}
