// Package share is the folder one computer offers to the other. Every peer
// path goes through os.Root, which stops "..", absolute paths and links that
// leave the folder, and does it without a check-then-open gap.
package share

import (
	"errors"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// MaxPage is the most entries List returns at once. It keeps one listing far
// below the peer protocol's frame cap.
const MaxPage = 1000

// Entry describes one file or folder. Names are base names only.
type Entry struct {
	Name string `json:"name"`
	// Size is in bytes.
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
	IsDir   bool      `json:"isDir"`
}

// Root is one open shared folder. It is safe for concurrent use. Close it when
// the session ends: on Windows an open root also stops the folder being
// renamed or deleted.
type Root struct {
	trees         map[string]AddedFile
	root          *os.Root
	name          string
	mu            sync.Mutex
	listings      map[string]listing
	link          func(string, string) error
	readDirectory func(*os.File) ([]string, error)
}

// Open opens the folder the user chose to share.
func Open(dir string) (*Root, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, errors.New("Could not open the shared folder.")
	}

	// Only the last part of the path is shown to the other computer.
	name := filepath.Base(root.Name())
	if name == "." || name == string(filepath.Separator) {
		name = "Shared folder"
	}

	return &Root{root: root, name: name}, nil
}

// Name is the folder's base name, for display. It is not a path.
func (shared *Root) Name() string {
	return shared.name
}

// Close releases the folder.
func (shared *Root) Close() error {
	return shared.root.Close()
}

// Stat describes the file or folder at a peer path.
func (shared *Root) Stat(wire string) (Entry, error) {
	local, err := Localize(wire)
	if err != nil {
		return Entry{}, err
	}

	info, err := shared.root.Stat(local)
	if err != nil {
		return Entry{}, mapError(err)
	}

	name := path.Base(wire)
	if wire == "" {
		name = shared.name
	}

	return entryOf(name, info), nil
}

// List returns one page of a folder, folders first and then by name without
// regard to case, plus the folder's total entry count. A link that cannot be
// followed inside the folder is left out rather than shown half-broken.
func (shared *Root) List(dir string, offset, limit int) ([]Entry, int, error) {
	local, err := Localize(dir)
	if err != nil {
		return nil, 0, err
	}

	shared.mu.Lock()
	defer shared.mu.Unlock()
	if cached, ok := shared.listings[local]; ok && time.Since(cached.at) < 2*time.Second {
		if info, err := shared.root.Stat(local); err == nil && info.ModTime() == cached.modified {
			return pageEntries(cached.entries, offset, limit)
		}
	}

	handle, err := shared.root.Open(local)
	if err != nil {
		return nil, 0, mapError(err)
	}
	defer handle.Close()

	readDirectory := func(file *os.File) ([]string, error) { return file.Readdirnames(-1) }
	if shared.readDirectory != nil {
		readDirectory = shared.readDirectory
	}
	names, err := readDirectory(handle)
	if err != nil {
		return nil, 0, mapError(err)
	}

	entries := make([]Entry, 0, len(names))
	for _, name := range names {
		if strings.HasSuffix(strings.ToLower(strings.TrimRight(name, ". ")), PartialSuffix) {
			continue
		}

		// Stat follows links, but only inside the root.
		info, err := shared.root.Stat(filepath.Join(local, name))
		if err != nil {
			continue
		}

		entries = append(entries, entryOf(name, info))
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}

		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})

	info, err := handle.Stat()
	if err == nil {
		if shared.listings == nil || len(shared.listings) >= 128 {
			shared.listings = make(map[string]listing)
		}
		shared.listings[local] = listing{entries: entries, at: time.Now(), modified: info.ModTime()}
	}
	return pageEntries(entries, offset, limit)
}

type listing struct {
	entries      []Entry
	at, modified time.Time
}

func pageEntries(entries []Entry, offset, limit int) ([]Entry, int, error) {
	total := len(entries)
	if limit <= 0 || limit > MaxPage {
		limit = MaxPage
	}
	if offset < 0 || offset > total {
		offset = total
	}

	return append([]Entry{}, entries[offset:min(offset+limit, total)]...), total, nil
}

func entryOf(name string, info fs.FileInfo) Entry {
	return Entry{Name: name, Size: info.Size(), ModTime: info.ModTime().UTC(), IsDir: info.IsDir()}
}

// mapError turns an OS error into a plain sentence. The OS error names a
// local path, so it never leaves this package.
func mapError(err error) error {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return ErrNotFound
	case errors.Is(err, fs.ErrExist):
		return ErrExists
	default:
		return ErrDenied
	}
}

// SameFolder compares a configured directory with this open folder's identity.
func (shared *Root) SameFolder(folder string) bool {
	current, err := shared.root.Stat(".")
	if err != nil {
		return false
	}
	offered, err := os.Stat(filepath.Clean(folder))
	return err == nil && os.SameFile(current, offered)
}
