//go:build !windows

package share

import (
	"os"
	"syscall"
)

func isImportLink(info os.FileInfo) bool {
	return info.Mode()&os.ModeSymlink != 0
}

// isSystemLink reports a link that only root could have made, such as macOS /var or
// /home on Fedora Silverblue. An ancestor like that is the machine's layout, not a trick,
// so imports may pass through it. Links the person or an app made stay refused.
func isSystemLink(info os.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return isImportLink(info) && ok && stat.Uid == 0
}
