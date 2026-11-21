package share

import (
	"errors"
	"os"
	"path"
	"time"
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
	shared := &Root{root: root, name: name}
	if err := shared.prunePartials(time.Now().Add(-7 * 24 * time.Hour)); err != nil {
		_ = shared.Close()
		return nil, err
	}
	return shared, nil
}
