package api

import (
	"context"
	"encoding/json"
	"github.com/connor-davis/tailshare/internal/services/share"
	"strings"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/gofiber/fiber/v3"
)

// Transfer directions, from this computer's point of view.
const (
	// DirectionUpload sends a local file into the other computer's folder.
	DirectionUpload = "upload"
	// DirectionDownload brings a file from the other computer.
	DirectionDownload = "download"
)

// TransferRequest asks for one file to move. Source and Destination are
// paths on the sending and receiving side; the manager checks them.
type TransferRequest struct {
	// Direction is upload or download.
	Direction   string `json:"direction"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
}

// TransferItem is one transfer in the queue. State is one of queued, starting,
// running, paused, done, failed or canceled.
type TransferItem struct {
	ID string `json:"id"`
	// Direction is upload or download.
	Direction   string `json:"direction"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	// Size is the whole file size in bytes, at most 1 TiB.
	Size int64 `json:"size"`
	// Bytes is how many bytes have moved so far, including any resumed prefix.
	Bytes int64  `json:"bytes"`
	State string `json:"state"`
	// Error is empty unless the transfer failed. It is a plain sentence.
	Error string `json:"error,omitempty"`
}

// TransferEvent says a transfer moved or changed. Type is "transfer.progress"
// or "transfer.state".
type TransferEvent struct {
	Type string       `json:"type"`
	Item TransferItem `json:"item"`
}

// Transfers is what the API needs from the transfer manager. Errors
// may be *apperr.Error, which the API passes through as is. List must never
// wait on a subscriber, because the live socket calls it while holding its lock.
type Transfers interface {
	// Enqueue adds a transfer and returns it.
	Enqueue(ctx context.Context, request TransferRequest) (TransferItem, error)
	// Pause stops a transfer so it can resume later.
	Pause(ctx context.Context, id string) (TransferItem, error)
	// Resume continues a paused transfer.
	Resume(ctx context.Context, id string) (TransferItem, error)
	// Cancel stops a transfer for good.
	Cancel(ctx context.Context, id string) (TransferItem, error)
	// List returns every transfer, oldest first.
	List() []TransferItem
	// Subscribe returns events until the stop function is called.
	Subscribe() (events <-chan TransferEvent, stop func())
}

func (server *Server) currentTransfers() (Transfers, error) {
	server.mu.Lock()
	defer server.mu.Unlock()

	if server.phase != phaseConnected || server.transfers == nil {
		return nil, errNotConnected()
	}

	return server.transfers, nil
}

// forwardTransfers puts the manager's events on the live socket.
func (server *Server) forwardTransfers(events <-chan TransferEvent, stop func()) {
	defer stop()

	for {
		select {
		case event, open := <-events:
			if !open {
				return
			}

			server.hub.publish(event.Type, event.Item)
		case <-server.ctx.Done():
			return
		}
	}
}

func (server *Server) transferList() []TransferItem {
	server.mu.Lock()
	transfers := server.transfers
	server.mu.Unlock()
	if transfers == nil {
		return []TransferItem{}
	}

	items := transfers.List()
	if items == nil {
		items = []TransferItem{}
	}

	return items
}

func (server *Server) listTransfers(c fiber.Ctx) error {
	transfers, err := server.currentTransfers()
	if err != nil {
		return err
	}

	items := transfers.List()
	if items == nil {
		items = []TransferItem{}
	}

	return c.JSON(fiber.Map{"items": items})
}

func (server *Server) startTransfer(c fiber.Ctx) error {
	transfers, err := server.currentTransfers()
	if err != nil {
		return err
	}

	var in TransferRequest
	if err := json.Unmarshal(c.Body(), &in); err != nil {
		return apperr.BadRequest("The request could not be understood.")
	}

	if in.Direction != DirectionUpload && in.Direction != DirectionDownload {
		return apperr.BadRequest("Choose upload or download.")
	}
	if in.Source == "" || in.Destination == "" {
		return apperr.BadRequest("Say which file to move and where to put it.")
	}

	if in.Direction == DirectionDownload && strings.ContainsAny(in.Destination, "/\\") ||
		(in.Direction == DirectionDownload && strings.Contains(in.Destination, "..")) {
		return share.ErrBadPath
	}
	item, err := transfers.Enqueue(server.ctx, in)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusAccepted).JSON(item)
}

// control runs pause, resume or cancel on the transfer named in the URL.
func (server *Server) control(
	c fiber.Ctx,
	act func(Transfers, context.Context, string) (TransferItem, error),
) error {
	transfers, err := server.currentTransfers()
	if err != nil {
		return err
	}

	item, err := act(transfers, server.ctx, c.Params("id"))
	if err != nil {
		return err
	}

	return c.JSON(item)
}

func (server *Server) pauseTransfer(c fiber.Ctx) error {
	return server.control(c, func(transfers Transfers, ctx context.Context, id string) (TransferItem, error) {
		return transfers.Pause(ctx, id)
	})
}

func (server *Server) resumeTransfer(c fiber.Ctx) error {
	return server.control(c, func(transfers Transfers, ctx context.Context, id string) (TransferItem, error) {
		return transfers.Resume(ctx, id)
	})
}

func (server *Server) cancelTransfer(c fiber.Ctx) error {
	return server.control(c, func(transfers Transfers, ctx context.Context, id string) (TransferItem, error) {
		return transfers.Cancel(ctx, id)
	})
}
