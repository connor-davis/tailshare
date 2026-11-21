package share

import (
	"errors"
	"io/fs"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"unicode"
)

// PartialSuffix marks private, unfinished transfer files.
const PartialSuffix = ".tailshare-part"

// Plain-sentence errors a peer's request can cause. They are safe to show on
// screen and never carry a local path.
var (
	// ErrBadPath means the path is not one a peer may ask for.
	ErrBadPath = errors.New("That path is not allowed.")
	// ErrNotFound means nothing exists at the path.
	ErrNotFound = errors.New("That file or folder was not found.")
	// ErrExists means a file is already at the path.
	ErrExists = errors.New("A file with that name already exists.")
	// ErrDenied means the path cannot be used, for example a link that leaves the folder.
	ErrDenied = errors.New("That file or folder is not available.")
	// ErrNotFile means the path is a folder where a file was needed.
	ErrNotFile = errors.New("That is a folder, not a file.")
)

// reserved are the Windows device names. Windows opens them as devices even
// with an extension ("CON.txt"), so every platform refuses them: a shared
// folder must look the same to both computers.
var reserved = map[string]bool{
	"CON": true, "PRN": true, "AUX": true, "NUL": true, "CONIN$": true, "CONOUT$": true,
	"COM1": true, "COM2": true, "COM3": true, "COM4": true, "COM5": true,
	"COM6": true, "COM7": true, "COM8": true, "COM9": true,
	"LPT1": true, "LPT2": true, "LPT3": true, "LPT4": true, "LPT5": true,
	"LPT6": true, "LPT7": true, "LPT8": true, "LPT9": true,
}

// Localize checks a slash-separated path from a peer and turns it into a path
// for os.Root. The empty path means the shared folder itself. It never cleans
// a bad path into a good one: a path with ".." is refused, not rewritten.
func Localize(wire string) (string, error) {
	if wire == "" {
		return ".", nil
	}

	// Lexical rules first: they are stricter than any one operating system.
	// A colon covers drive letters (C:, C:\) and NTFS alternate streams (a:b).
	if len(wire) > 4096 || strings.ContainsAny(wire, "\\:\x00") || !fs.ValidPath(wire) {
		return "", ErrBadPath
	}

	for part := range strings.SplitSeq(wire, "/") {
		if len(part) > 255 || shortAlias(part) || part == "." || part == ".." ||
			hasControl(part) || isReserved(part) ||
			strings.HasSuffix(strings.ToLower(strings.TrimRight(part, ". ")), PartialSuffix) {
			return "", ErrBadPath
		}
	}

	// Defense in depth: the standard library's own view of a safe local path.
	local, err := filepath.Localize(wire)
	if err != nil || !filepath.IsLocal(local) {
		return "", ErrBadPath
	}

	return local, nil
}

func hasControl(part string) bool {
	return strings.IndexFunc(part, unicode.IsControl) >= 0
}

// isReserved ignores case, an extension, and trailing dots or spaces, which
// Windows drops when it opens a name.
func isReserved(part string) bool {
	name := strings.TrimRight(part, ". ")
	if dot := strings.IndexByte(name, '.'); dot >= 0 {
		name = name[:dot]
	}

	return reserved[strings.ToUpper(strings.TrimRight(name, " "))]
}

// shortAlias reports a Windows 8.3 short name such as PROGRA~1 or FOO~12.TXT.
// Such a name can reach a file whose long name is hidden (a partial), so it is
// refused; longer names that merely contain "~2" stay allowed.
func shortAlias(part string) bool {
	if runtime.GOOS != "windows" {
		return false
	}

	// An 8.3 base is at most eight characters, the ~N tail included.
	base, _, _ := strings.Cut(part, ".")

	return len(base) <= 8 && shortAliasPattern.MatchString(part)
}

var shortAliasPattern = regexp.MustCompile(`^[^.~]{1,7}~[0-9]{1,6}(\.[^.]{0,3})?$`)
