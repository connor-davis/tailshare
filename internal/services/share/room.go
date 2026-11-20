package share

import (
	"errors"
	"os"
	"path"
)

// OpenRoom creates or reopens a child folder without following links outside rooms.
func OpenRoom(rooms, name string) (*Root, error) {
	if name == "" || path.Base(name) != name {
		return nil, ErrBadPath
	}
	if _, err := Localize(name); err != nil {
		return nil, err
	}
	parent, err := os.OpenRoot(rooms)
	if err != nil {
		return nil, ErrDenied
	}
	defer parent.Close()

	if err := parent.Mkdir(name, 0o700); err != nil && !errors.Is(err, os.ErrExist) {
		return nil, ErrDenied
	}
	root, err := parent.OpenRoot(name)
	if err != nil {
		return nil, ErrDenied
	}
	return &Root{root: root, name: name}, nil
}
