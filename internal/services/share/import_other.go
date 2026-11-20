//go:build !windows

package share

import "os"

func isImportLink(info os.FileInfo) bool {
	return info.Mode()&os.ModeSymlink != 0
}
