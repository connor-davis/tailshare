//go:build !windows

package share

import "golang.org/x/sys/unix"

// FreeSpace returns bytes available to the current user on this folder's volume.
func (shared *Root) FreeSpace() (int64, error) {
	var info unix.Statfs_t
	if err := unix.Statfs(shared.root.Name(), &info); err != nil {
		return 0, ErrDenied
	}

	return int64(info.Bavail) * int64(info.Bsize), nil
}
