package share

import (
	"errors"
	"io"
	"os"
	"path"
	"path/filepath"
)

// MaxTreeFiles bounds the work of importing or downloading one folder.
const MaxTreeFiles = 10000

// MaxTreeDepth bounds nesting below the top folder.
const MaxTreeDepth = 32

// ErrTreeLimit means a folder is too large or too deeply nested to share.
var ErrTreeLimit = errors.New("Choose a folder with at most 10,000 files and 32 levels.")

// ImportTree copies regular files without following links, junctions or reparse points.
// Empty folders are omitted. A failed import removes its incomplete tree.
func (shared *Root) ImportTree(source string) (AddedFile, error) {
	if !filepath.IsAbs(source) {
		return AddedFile{}, ErrBadPath
	}

	// Links above the picked folder (macOS /var is one) are the person's own layout. Follow
	// them once up front; the picked folder itself and everything below it stay link-free.
	source = filepath.Join(resolveParentLinks(filepath.Dir(source)), filepath.Base(source))

	// A destination inside the source would copy its own growing output.
	if relative, err := filepath.Rel(source, resolveParentLinks(shared.root.Name())); err == nil &&
		(relative == "." || filepath.IsLocal(relative)) {
		return AddedFile{}, ErrDenied
	}

	name := filepath.Base(source)
	if _, err := Localize(name); err != nil {
		return AddedFile{}, err
	}

	for current := source; ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil || isImportLink(info) {
			return AddedFile{}, ErrDenied
		}

		if current == filepath.Dir(current) {
			break
		}
	}

	info, err := os.Lstat(source)
	if err != nil || !info.IsDir() || isImportLink(info) {
		return AddedFile{}, ErrDenied
	}

	from, err := os.OpenRoot(source)
	if err != nil {
		return AddedFile{}, ErrDenied
	}

	defer from.Close()

	opened, err := from.Stat(".")
	if err != nil || !os.SameFile(info, opened) {
		return AddedFile{}, ErrDenied
	}

	shared.mu.Lock()
	defer shared.mu.Unlock()

	name, err = shared.AvailableName(name, nil)
	if err != nil {
		return AddedFile{}, err
	}

	if err := shared.root.Mkdir(name, 0o700); err != nil {
		return AddedFile{}, mapError(err)
	}

	result := AddedFile{Name: name, Folder: true}
	if err := shared.copyTree(from, "", name, 0, &result); err != nil {
		_ = shared.root.RemoveAll(name)

		return AddedFile{}, err
	}

	if result.Count == 0 {
		_ = shared.root.Remove(name)

		return AddedFile{}, ErrNotFile
	}

	if shared.trees == nil {
		shared.trees = make(map[string]AddedFile)
	}

	shared.trees[name] = result
	shared.listings = nil

	return result, nil
}

func (shared *Root) copyTree(
	from *os.Root, relative, target string, depth int, result *AddedFile,
) error {
	if depth > MaxTreeDepth {
		return ErrTreeLimit
	}

	local, err := Localize(relative)
	if err != nil {
		return err
	}

	info, err := from.Lstat(local)
	if err != nil || !info.IsDir() || isImportLink(info) {
		return ErrDenied
	}

	directory, err := from.Open(local)
	if err != nil {
		return ErrDenied
	}

	opened, err := directory.Stat()
	if err != nil || !os.SameFile(info, opened) {
		_ = directory.Close()

		return ErrDenied
	}

	names, err := directory.Readdirnames(-1)
	_ = directory.Close()
	if err != nil {
		return ErrDenied
	}

	for _, name := range names {
		if _, err := Localize(name); err != nil || path.Base(name) != name {
			return ErrBadPath
		}

		relativeName := path.Join(relative, name)
		localName, err := Localize(relativeName)
		if err != nil {
			return err
		}

		info, err := from.Lstat(localName)
		if err != nil || isImportLink(info) {
			return ErrDenied
		}

		if info.IsDir() {
			if err := shared.copyTree(from, relativeName, target, depth+1, result); err != nil {
				return err
			}

			continue
		}

		if !info.Mode().IsRegular() {
			continue
		}

		if result.Count >= MaxTreeFiles {
			return ErrTreeLimit
		}

		if err := shared.copyTreeFile(from, localName, path.Join(target, relativeName), info, result); err != nil {
			return err
		}
	}

	return nil
}

func (shared *Root) copyTreeFile(
	from *os.Root, source, destination string, info os.FileInfo, result *AddedFile,
) error {
	file, err := from.Open(source)
	if err != nil {
		return ErrDenied
	}

	defer file.Close()

	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(info, opened) {
		return ErrDenied
	}

	if err := shared.MakeDirs(path.Dir(destination)); err != nil {
		return err
	}

	target, err := shared.Create(destination)
	if err != nil {
		return err
	}

	size, copyError := io.Copy(target, file)
	closeError := target.Close()
	if copyError != nil || closeError != nil || size > 1<<40-result.Size {
		return ErrDenied
	}

	result.Count++
	result.Size += size

	return nil
}

// TreeSummary returns the counts captured during this room's folder import.
func (shared *Root) TreeSummary(wire string) (AddedFile, bool) {
	shared.mu.Lock()
	defer shared.mu.Unlock()

	result, ok := shared.trees[wire]

	return result, ok
}

// MakeDirs creates validated parents through the pinned root only.
func (shared *Root) MakeDirs(wire string) error {
	local, err := Localize(wire)
	if err != nil {
		return err
	}

	if err := shared.root.MkdirAll(local, 0o700); err != nil {
		return mapError(err)
	}

	return nil
}

// ReserveFolder atomically claims a collision-safe top folder without replacing one.
func (shared *Root) ReserveFolder(name string) (string, error) {
	if path.Base(name) != name || name == "" {
		return "", ErrBadPath
	}

	for number := 1; number <= 10000; number++ {
		candidate := NumberedName(name, number)
		local, err := Localize(candidate)
		if err != nil {
			return "", err
		}

		if err := shared.root.Mkdir(local, 0o700); err != nil {
			if errors.Is(err, os.ErrExist) {
				continue
			}

			return "", mapError(err)
		}

		return candidate, nil
	}

	return "", ErrExists
}
