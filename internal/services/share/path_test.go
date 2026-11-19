package share

import (
	"errors"
	"testing"
)

func TestLocalizeRejects(t *testing.T) {
	bad := []string{
		"..", "../x", "a/../b", "a/..", "a/../../x", "./a", "a/./b", ".",
		"/etc/passwd", "/", "//server/share", "a//b", "a/", "/a",
		"C:\\Windows", "C:", "C:/Windows", "c:foo", "\\\\server\\share", "a\\b", "..\\x",
		"a\x00b", "file.txt:stream", "a:b",
		"CON", "con", "Con.txt", "dir/NUL", "aux.tar.gz", "COM1", "lpt9.txt", "CONIN$", "conout$",
		"CON.", "CON ", "nul .txt", "dir/PRN/file",
		"bad\nname", "tab\tname",
	}

	for _, wire := range bad {
		if _, err := Localize(wire); !errors.Is(err, ErrBadPath) {
			t.Errorf("Localize(%q) = %v, want ErrBadPath", wire, err)
		}
	}
}

func TestLocalizeAccepts(t *testing.T) {
	good := []string{"", "a", "a/b/c.txt", "My Photos/2026/img 1.jpg", "..hidden", "con-tent", "COM10", "x."}

	for _, wire := range good {
		if _, err := Localize(wire); err != nil {
			t.Errorf("Localize(%q) = %v, want ok", wire, err)
		}
	}

	if local, _ := Localize(""); local != "." {
		t.Errorf("Localize(\"\") = %q, want the folder itself", local)
	}
}
