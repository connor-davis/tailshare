package api

import (
	"context"
	"encoding/json"
	"path"
	"strings"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/connor-davis/tailshare/internal/services/transfer"
	"github.com/gofiber/fiber/v3"
)

func walkPeerFolder(
	ctx context.Context, folder string,
	list func(context.Context, string, int, int) (peer.ListResult, error),
) ([]transfer.TreeFile, error) {
	if _, err := share.Localize(folder); err != nil || folder == "" {
		return nil, share.ErrBadPath
	}

	files := make([]transfer.TreeFile, 0)
	visited := 0

	var walk func(string, int) error
	walk = func(relative string, depth int) error {
		if depth > share.MaxTreeDepth {
			return share.ErrTreeLimit
		}

		seen := make(map[string]bool)
		for offset := 0; ; {
			if err := ctx.Err(); err != nil {
				return err
			}

			page, err := list(ctx, path.Join(folder, relative), offset, 100)
			if err != nil {
				return err
			}

			if page.Total < offset || len(page.Entries) > 100 ||
				(len(page.Entries) == 0 && offset < page.Total) {
				return share.ErrBadPath
			}

			for _, entry := range page.Entries {
				name := entry.Name
				if _, err := share.Localize(name); err != nil || name == "" ||
					strings.ContainsAny(name, "/\\") || seen[strings.ToLower(name)] {
					return share.ErrBadPath
				}

				seen[strings.ToLower(name)] = true
				visited++
				// Bound empty-folder trees as well as trees containing files.
				if visited > share.MaxTreeFiles*2 {
					return share.ErrTreeLimit
				}

				rel := path.Join(relative, name)
				remote := path.Join(folder, rel)
				if _, err := share.Localize(remote); err != nil {
					return err
				}

				if entry.IsDir {
					if err := walk(rel, depth+1); err != nil {
						return err
					}
				} else {
					if len(files) >= share.MaxTreeFiles || entry.Size < 0 || entry.Size > 1<<40 {
						return share.ErrTreeLimit
					}

					files = append(files, transfer.TreeFile{Remote: remote, Relative: rel})
				}
			}

			offset += len(page.Entries)
			if offset >= page.Total {
				return nil
			}
		}
	}

	if err := walk("", 0); err != nil {
		return nil, err
	}

	return files, nil
}

func (server *Server) folderTransfer(c fiber.Ctx) error {
	var in struct {
		PeerPath string `json:"peerPath"`
		Folder   string `json:"folder"`
	}

	if json.Unmarshal(c.Body(), &in) != nil || in.PeerPath == "" {
		return apperr.BadRequest("Choose a folder to download.")
	}

	current, err := server.roomFor(c)
	if err != nil {
		return err
	}

	other, err := server.peerOf(current)
	if err != nil {
		return err
	}

	ctx, cancel := server.contextWithin(10 * time.Minute)
	defer cancel()

	files, err := walkPeerFolder(ctx, in.PeerPath, other.List)
	if err != nil {
		return err
	}

	if len(files) == 0 {
		return apperr.BadRequest("That folder has no files to download.")
	}

	var picked *share.Root
	if in.Folder != "" {
		if err := pickedFolder(in.Folder); err != nil {
			return err
		}

		picked, err = share.Open(in.Folder)
		if err != nil {
			return err
		}
	}

	server.mu.Lock()
	defer server.mu.Unlock()

	if current.peer != other || current.manager == nil || server.ctx.Err() != nil {
		if picked != nil {
			_ = picked.Close()
		}

		return errNotConnected()
	}

	root := server.downloadRoot
	if picked != nil {
		root = picked
		for _, existing := range server.downloadRoots {
			if existing.SameFolder(in.Folder) {
				_ = picked.Close()
				root = existing
				break
			}
		}

		if root == picked {
			server.downloadRoots = append(server.downloadRoots, root)
		}
	}

	items, err := current.manager.DownloadTree(ctx, path.Base(in.PeerPath), files, root)
	server.pruneDownloadRootsLocked()
	if err != nil {
		return err
	}

	result := make([]TransferItem, 0, len(items))
	for _, item := range items {
		result = append(result, transferItem(item))
	}

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"items": result})
}
