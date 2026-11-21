package share

import "golang.org/x/sys/windows"

// FreeSpace returns bytes available to the current user on this folder's volume.
func (shared *Root) FreeSpace() (int64, error) {
	name, err := windows.UTF16PtrFromString(shared.root.Name())
	if err != nil {
		return 0, ErrDenied
	}

	var available uint64
	if err := windows.GetDiskFreeSpaceEx(name, &available, nil, nil); err != nil {
		return 0, ErrDenied
	}

	return int64(min(available, uint64(1<<63-1))), nil
}
