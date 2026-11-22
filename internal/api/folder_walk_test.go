package api

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
)

func TestPeerFolderWalkRejectsEscapingEntryNames(t *testing.T) {
	for _, name := range []string{
		"..", "/absolute", "C:/outside", `C:\outside`, `\\server\share`,
		"CON", "NUL.txt", "COM1", "sub/file", `sub\file`, "", ".",
	} {
		t.Run(name, func(t *testing.T) {
			list := func(context.Context, string, int, int) (peer.ListResult, error) {
				return peer.ListResult{Entries: []share.Entry{{Name: name}}, Total: 1}, nil
			}

			if _, err := walkPeerFolder(context.Background(), "Tree", list); err == nil {
				t.Fatal("accepted an escaping peer name")
			}
		})
	}
}

func TestPeerFolderWalkPagesAndPreservesRelativeNames(t *testing.T) {
	calls := make(map[string]int)
	list := func(_ context.Context, path string, offset, limit int) (peer.ListResult, error) {
		calls[path]++
		if limit != 100 {
			t.Fatal(limit)
		}

		if path == "Tree/sub" {
			return peer.ListResult{Entries: []share.Entry{{Name: "inner.txt", Size: 2}}, Total: 1}, nil
		}

		entries := []share.Entry{{Name: "sub", IsDir: true}}
		for index := range 101 {
			entries = append(entries, share.Entry{Name: fmt.Sprintf("f%d", index)})
		}

		return peer.ListResult{Entries: entries[offset:min(offset+limit, len(entries))], Total: len(entries)}, nil
	}

	files, err := walkPeerFolder(context.Background(), "Tree", list)
	if err != nil || len(files) != 102 || files[0].Remote != "Tree/sub/inner.txt" ||
		files[0].Relative != "sub/inner.txt" || calls["Tree"] != 2 || calls["Tree/sub"] != 1 {
		t.Fatalf("%+v %v calls=%v", files, err, calls)
	}
}

func TestPeerFolderWalkCapsAndBrokenPages(t *testing.T) {
	for _, kind := range []string{"files", "depth", "empty page", "duplicate"} {
		t.Run(kind, func(t *testing.T) {
			list := func(_ context.Context, path string, offset, limit int) (peer.ListResult, error) {
				switch kind {
				case "depth":
					return peer.ListResult{Entries: []share.Entry{{Name: "d", IsDir: true}}, Total: 1}, nil
				case "empty page":
					return peer.ListResult{Total: 1}, nil
				case "duplicate":
					return peer.ListResult{Entries: []share.Entry{{Name: "a"}, {Name: "A"}}, Total: 2}, nil
				default:
					entries := make([]share.Entry, 0, limit)
					for index := offset; index < min(offset+limit, share.MaxTreeFiles+1); index++ {
						entries = append(entries, share.Entry{Name: fmt.Sprintf("f%d", index)})
					}

					return peer.ListResult{Entries: entries, Total: share.MaxTreeFiles + 1}, nil
				}
			}

			if _, err := walkPeerFolder(context.Background(), "Tree", list); err == nil {
				t.Fatal("accepted unbounded or malformed tree")
			}
		})
	}

	for _, folder := range []string{"../escape", "/outside", "C:/outside", `\\server\share`, "CON"} {
		_, err := walkPeerFolder(context.Background(), folder, nil)
		if err == nil {
			t.Fatal(folder)
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := walkPeerFolder(ctx, "Tree", nil); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
