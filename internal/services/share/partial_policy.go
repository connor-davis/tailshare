package share

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type partialIdentity struct {
	Owner string
	Hash  string
	Size  int64
}

// ClaimPartial reserves a partial for exactly one authenticated sender and checksum.
func (shared *Root) ClaimPartial(wire, owner, hash string, size int64) error {
	local, err := shared.partialName(wire)
	if err != nil {
		return err
	}

	shared.mu.Lock()
	defer shared.mu.Unlock()

	metadata := strings.TrimSuffix(local, PartialSuffix) + ".meta" + PartialSuffix
	identity := partialIdentity{owner, hash, size}

	if info, err := shared.root.Lstat(metadata); err == nil && !info.Mode().IsRegular() {
		return ErrDenied
	}

	file, err := shared.root.Open(metadata)
	if err == nil {
		defer file.Close()
		var previous partialIdentity
		if json.NewDecoder(io.LimitReader(file, 4096)).Decode(&previous) != nil || previous != identity {
			return ErrDenied
		}

		return nil
	}

	if !errors.Is(err, fs.ErrNotExist) {
		return ErrDenied
	}

	if info, err := shared.root.Lstat(local); err == nil && info.Size() != 0 {
		return ErrDenied
	}

	count := 0
	var total int64
	err = fs.WalkDir(shared.root.FS(), ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if !entry.IsDir() && strings.HasSuffix(name, PartialSuffix) {
			info, err := entry.Info()
			if err != nil {
				return err
			}

			count++
			total += info.Size()
			if strings.HasSuffix(name, ".meta"+PartialSuffix) {
				file, err := shared.root.Open(filepath.FromSlash(name))
				if err != nil {
					return err
				}
				var reserved partialIdentity
				decodeError := json.NewDecoder(io.LimitReader(file, 4096)).Decode(&reserved)
				_ = file.Close()
				if decodeError != nil || reserved.Size < 0 || reserved.Size > 1<<40 {
					return ErrDenied
				}
				total += reserved.Size
			}

		}

		return nil
	})
	if err != nil || count > 198 || size > (1<<40)-total {
		return ErrDenied
	}

	file, err = shared.root.OpenFile(metadata, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return mapError(err)
	}

	writeError := json.NewEncoder(file).Encode(identity)
	closeError := file.Close()
	if writeError != nil || closeError != nil {
		_ = shared.root.Remove(metadata)
		return ErrDenied
	}

	return nil
}

func (shared *Root) prunePartials(before time.Time) error {
	return fs.WalkDir(shared.root.FS(), ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return ErrDenied
		}

		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(name), PartialSuffix) {
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			return ErrDenied
		}

		if info.ModTime().Before(before) {
			if err := shared.root.Remove(filepath.FromSlash(name)); err != nil {
				return ErrDenied
			}

		}

		return nil
	})
}
