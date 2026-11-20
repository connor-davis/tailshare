package share

import (
	"os"
	"syscall"
)

func isImportLink(info os.FileInfo) bool {
	// Junctions are reparse points but Go does not mark them as symlinks.
	data, ok := info.Sys().(*syscall.Win32FileAttributeData)
	return info.Mode()&os.ModeSymlink != 0 ||
		(ok && data.FileAttributes&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0)
}
