package api

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/gofiber/fiber/v3"
)

// connectedPeer returns the open conversation, or a conflict if there is none.
func (server *Server) connectedPeer() (*peer.Peer, error) {
	server.mu.Lock()
	defer server.mu.Unlock()

	current := server.activeLocked()
	if current == nil {
		return nil, errNotConnected()
	}

	if current.peer == nil {
		return nil, errNotConnected()
	}

	return current.peer, nil
}

func (server *Server) postChat(c fiber.Ctx) error {
	var in struct {
		Text       string `json:"text"`
		RoomCode   string `json:"roomCode"`
		Attachment *struct {
			Path string `json:"path"`
		} `json:"attachment"`
	}

	if err := json.Unmarshal(c.Body(), &in); err != nil {
		return apperr.BadRequest("The request could not be understood.")
	}

	other, err := server.connectedPeer()
	if err != nil {
		return err
	}

	ctx, cancel := server.contextWithin(callTimeout)
	defer cancel()

	var attachment *peer.Attachment
	if in.Attachment != nil {
		if in.Attachment.Path == "" {
			return share.ErrBadPath
		}

		server.mu.Lock()
		current := server.activeLocked()
		if current == nil {
			server.mu.Unlock()
			return errNotConnected()
		}

		root := current.root
		if root == nil {
			server.mu.Unlock()

			return errNotConnected()
		}

		if in.RoomCode != "" {
			code, err := codes.Parse(in.RoomCode)
			if err != nil || root.Name() != code.String() {
				server.mu.Unlock()

				return errNotConnected()
			}
		}

		entry, err := root.Stat(in.Attachment.Path)
		if err != nil {
			server.mu.Unlock()

			return err
		}

		if entry.IsDir {
			summary, ok := root.TreeSummary(in.Attachment.Path)
			server.mu.Unlock()
			if !ok {
				return apperr.BadRequest("Add that folder to the room again.")
			}

			attachment = &peer.Attachment{Name: entry.Name, Path: in.Attachment.Path, Size: summary.Size, Folder: true, Count: summary.Count}
		} else {
			file, err := root.OpenRead(in.Attachment.Path)
			if err != nil {
				server.mu.Unlock()

				return err
			}

			info, statError := file.Stat()
			_ = file.Close()
			server.mu.Unlock()
			if statError != nil || !info.Mode().IsRegular() {
				return apperr.BadRequest("Choose a regular room file.")
			}

			attachment = &peer.Attachment{Name: info.Name(), Path: in.Attachment.Path, Size: info.Size()}
		}
	}

	message, err := other.SendChat(ctx, in.Text, attachment)
	if err != nil {
		return chatError(other, err)
	}

	return c.Status(fiber.StatusCreated).JSON(message)
}

// chatError tells a bad message apart from a lost connection. SendChat's own
// checks are plain sentences for the writer; anything else while the
// connection is down means the other computer is gone.
func chatError(other *peer.Peer, err error) error {
	var remote *peer.RemoteError
	if errors.As(err, &remote) {
		return err
	}

	select {
	case <-other.Done():
		return errUnreachable()
	default:
	}

	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return errUnreachable()
	}

	switch err.Error() {
	case "Attach one file at a time.", "That attachment is not valid.", "Type a message first.",
		"That message is too long. Keep it under 8 KB.", "That message has characters that cannot be sent.":
		return apperr.BadRequest(err.Error())
	}
	return errUnreachable()
}

func (server *Server) getChat(c fiber.Ctx) error {
	other, err := server.connectedPeer()
	if err != nil {
		return err
	}

	// The peer keeps chat in memory only; a subscription is how to read it.
	subscription := other.Subscribe()
	defer subscription.Close()

	return c.JSON(fiber.Map{"items": subscription.Snapshot})
}
