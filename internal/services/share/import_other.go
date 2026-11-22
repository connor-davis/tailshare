//go:build !windows

package share

import (
	"os"
	"path/filepath"
)

func isImportLink(info os.FileInfo) bool {
	return info.Mode()&os.ModeSymlink != 0
}

// resolveParentLinks follows links in a folder path. A path it cannot resolve stays as given,
// so the checks that follow still refuse it.
func resolveParentLinks(folder string) string {
	if resolved, err := filepath.EvalSymlinks(folder); err == nil {
		return resolved
	}

	return folder
}
