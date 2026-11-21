package share

import (
	"errors"
	"path/filepath"
	"testing"

	"golang.org/x/sys/windows"
)

func TestAuditActualShortPartialAlias(t *testing.T) {
	root, inside, _ := openShared(t)
	partial := filepath.Join(inside, "movie.mkv"+PartialSuffix)
	writeFile(t, partial, "private")
	long, err := windows.UTF16PtrFromString(partial)
	if err != nil {
		t.Fatal(err)
	}
	buffer := make([]uint16, 32768)
	count, err := windows.GetShortPathName(long, &buffer[0], uint32(len(buffer)))
	if err != nil || count == 0 {
		t.Skipf("short aliases unavailable: %v", err)
	}
	alias := filepath.Base(windows.UTF16ToString(buffer[:count]))
	if alias == filepath.Base(partial) {
		t.Skip("volume has no short alias for this file")
	}
	if _, err := root.OpenRead(alias); !errors.Is(err, ErrBadPath) && !errors.Is(err, ErrNotFound) {
		t.Fatalf("partial exposed through %q: %v", alias, err)
	}
}
