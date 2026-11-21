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

	// PrefixSize and PrefixHash are the receiver's own checkpoint of the bytes it holds. They
	// are not part of who owns the partial, so ClaimPartial ignores them when it compares.
	PrefixSize int64
	PrefixHash string
}

func (identity partialIdentity) sameOwner(other partialIdentity) bool {
	return identity.Owner == other.Owner && identity.Hash == other.Hash && identity.Size == other.Size
}

func (shared *Root) metaName(local string) string {
	return strings.TrimSuffix(local, PartialSuffix) + ".meta" + PartialSuffix
}

// SavePartialPrefix records the hash of the first size bytes of a claimed partial.
func (shared *Root) SavePartialPrefix(wire string, size int64, hash string) error {
	local, err := shared.partialName(wire)
	if err != nil {
		return err
	}

	shared.mu.Lock()
	defer shared.mu.Unlock()

	metadata := shared.metaName(local)
	identity, ok := shared.readIdentity(metadata)
	if !ok {
		return ErrDenied
	}

	identity.PrefixSize, identity.PrefixHash = size, hash
	file, err := shared.root.OpenFile(metadata, os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return mapError(err)
	}

	writeError := json.NewEncoder(file).Encode(identity)
	closeError := file.Close()
	if writeError != nil || closeError != nil {
		return ErrDenied
	}

	return nil
}

// PartialPrefix returns the saved checkpoint of a partial. Size is zero when there is none.
func (shared *Root) PartialPrefix(wire string) (int64, string) {
	local, err := shared.partialName(wire)
	if err != nil {
		return 0, ""
	}

	shared.mu.Lock()
	defer shared.mu.Unlock()

	identity, ok := shared.readIdentity(shared.metaName(local))
	if !ok {
		return 0, ""
	}

	return identity.PrefixSize, identity.PrefixHash
}

func (shared *Root) readIdentity(metadata string) (partialIdentity, bool) {
	var identity partialIdentity
	info, err := shared.root.Lstat(metadata)
	if err != nil || !info.Mode().IsRegular() {
		return identity, false
	}

	file, err := shared.root.Open(metadata)
	if err != nil {
		return identity, false
	}
	defer file.Close()

	if json.NewDecoder(io.LimitReader(file, 4096)).Decode(&identity) != nil {
		return identity, false
	}

	return identity, true
}

// ClaimPartial reserves a partial for exactly one authenticated sender and checksum.
func (shared *Root) ClaimPartial(wire, owner, hash string, size int64) error {
	local, err := shared.partialName(wire)
	if err != nil {
		return err
	}

	shared.mu.Lock()
	defer shared.mu.Unlock()

	metadata := shared.metaName(local)
	identity := partialIdentity{Owner: owner, Hash: hash, Size: size}

	if info, err := shared.root.Lstat(metadata); err == nil && !info.Mode().IsRegular() {
		return ErrDenied
	}

	file, err := shared.root.Open(metadata)
	if err == nil {
		defer file.Close()
		var previous partialIdentity
		if json.NewDecoder(io.LimitReader(file, 4096)).Decode(&previous) != nil || !previous.sameOwner(identity) {
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
