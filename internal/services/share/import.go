package share

import (
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// AddedFile describes a copied room file without exposing its source path.
type AddedFile struct {
	Name   string `json:"name"`
	Folder bool   `json:"folder,omitempty"`
	Count  int64  `json:"count,omitempty"`
	// Size is the number of bytes copied.
	Size int64 `json:"size"`
}

// NumberedName keeps the extension when adding a collision suffix.
func NumberedName(name string, number int) string {
	if number == 1 {
		return name
	}
	extension := path.Ext(name)
	return fmt.Sprintf("%s (%d)%s", strings.TrimSuffix(name, extension), number, extension)
}

// AvailableName finds an unused relative name, including broken links and partials.
func (shared *Root) AvailableName(wire string, busy func(string) bool) (string, error) {
	if _, err := Localize(wire); err != nil || wire == "" {
		return "", ErrBadPath
	}
	for number := 1; number <= 10000; number++ {
		candidate := NumberedName(wire, number)
		local, err := Localize(candidate)
		if err != nil {
			return "", err
		}
		if busy != nil && busy(candidate) {
			continue
		}

		_, err = shared.root.Lstat(local)
		if err == nil {
			continue
		}
		if !errors.Is(err, os.ErrNotExist) {
			return "", ErrDenied
		}
		_, err = shared.root.Lstat(local + PartialSuffix)
		if errors.Is(err, os.ErrNotExist) {
			return candidate, nil
		}
		if err != nil {
			return "", ErrDenied
		}
	}
	return "", ErrExists
}

// Import copies a consented regular local file and atomically publishes without replacing.
func (shared *Root) Import(source string) (AddedFile, error) {
	if !filepath.IsAbs(source) {
		return AddedFile{}, ErrBadPath
	}
	name := filepath.Base(source)
	if _, err := Localize(name); err != nil {
		return AddedFile{}, err
	}

	// Refuse links and junctions, including paths reached through one. A root-owned
	// link above the file (macOS /var) is the machine's layout and may stay.
	for current := source; ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil || (isImportLink(info) && (current == source || !isSystemLink(info))) {
			return AddedFile{}, ErrDenied
		}
		if filepath.Dir(current) == current {
			break
		}
	}
	info, err := os.Lstat(source)
	if err != nil || !info.Mode().IsRegular() {
		return AddedFile{}, ErrNotFile
	}
	file, err := os.Open(source)
	if err != nil {
		return AddedFile{}, ErrDenied
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(info, opened) {
		return AddedFile{}, ErrDenied
	}
	temporary := rand.Text() + PartialSuffix
	target, err := shared.root.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return AddedFile{}, ErrDenied
	}
	defer shared.root.Remove(temporary)

	size, copyError := io.Copy(target, file)
	closeError := target.Close()
	if copyError != nil || closeError != nil {
		return AddedFile{}, ErrDenied
	}
	for number := 1; number <= 10000; number++ {
		candidate := NumberedName(name, number)
		if _, err := Localize(candidate); err != nil {
			return AddedFile{}, err
		}
		if err := shared.root.Link(temporary, candidate); err != nil {
			if errors.Is(err, os.ErrExist) {
				continue
			}
			return AddedFile{}, ErrDenied
		}
		return AddedFile{Name: candidate, Size: size}, nil
	}
	return AddedFile{}, ErrExists
}
