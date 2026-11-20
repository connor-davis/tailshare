package api

import (
	"context"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/transfer"
)

// managedTransfers preserves the local API contract around a session's manager.
type managedTransfers struct {
	manager *transfer.Manager
	ctx     context.Context
	cancel  context.CancelFunc
}

func newManagedTransfers(manager *transfer.Manager) *managedTransfers {
	ctx, cancel := context.WithCancel(context.Background())
	return &managedTransfers{manager: manager, ctx: ctx, cancel: cancel}
}

func transferItem(item transfer.Transfer) TransferItem {
	source, destination := item.LocalPath, item.PeerPath
	if item.Direction == peer.DirectionDownload {
		source, destination = item.PeerPath, item.LocalPath
	}

	return TransferItem{
		ID: item.ID, Direction: string(item.Direction), Source: source, Destination: destination,
		Size: item.Size, Bytes: item.Bytes, State: string(item.State), Error: item.Reason,
	}
}

func (adapter *managedTransfers) Enqueue(ctx context.Context, request TransferRequest) (TransferItem, error) {
	var item transfer.Transfer
	var err error
	if request.Direction == DirectionUpload {
		item, err = adapter.manager.Upload(ctx, request.Source, request.Destination)
	} else {
		item, err = adapter.manager.Download(ctx, request.Source, request.Destination)
	}

	return transferItem(item), err
}

func (adapter *managedTransfers) find(id string) (TransferItem, error) {
	for _, item := range adapter.manager.Snapshot() {
		if item.ID == id {
			return transferItem(item), nil
		}
	}

	return TransferItem{}, apperr.NotFound("That transfer was not found.")
}

func (adapter *managedTransfers) Pause(_ context.Context, id string) (TransferItem, error) {
	if _, err := adapter.find(id); err != nil {
		return TransferItem{}, err
	}
	if err := adapter.manager.Pause(id); err != nil {
		return TransferItem{}, err
	}

	return adapter.find(id)
}

func (adapter *managedTransfers) Resume(_ context.Context, id string) (TransferItem, error) {
	if _, err := adapter.find(id); err != nil {
		return TransferItem{}, err
	}

	item, err := adapter.manager.Resume(id)
	return transferItem(item), err
}

func (adapter *managedTransfers) Cancel(_ context.Context, id string) (TransferItem, error) {
	if _, err := adapter.find(id); err != nil {
		return TransferItem{}, err
	}
	if err := adapter.manager.Cancel(id); err != nil {
		return TransferItem{}, err
	}

	return adapter.find(id)
}

func (adapter *managedTransfers) List() []TransferItem {
	items := adapter.manager.Snapshot()
	result := make([]TransferItem, 0, len(items))
	for _, item := range items {
		result = append(result, transferItem(item))
	}

	return result
}

func (adapter *managedTransfers) Subscribe() (<-chan TransferEvent, func()) {
	ctx, stop := context.WithCancel(adapter.ctx)
	events := make(chan TransferEvent)
	subscription := adapter.manager.Subscribe()
	go func() {
		defer close(events)
		defer func() { subscription.Close() }()

		states := make(map[string]transfer.State)
		send := func(item transfer.Transfer, snapshot bool) bool {
			kind := "transfer.state"
			if previous, known := states[item.ID]; known && previous == item.State && !snapshot {
				kind = "transfer.progress"
			}
			states[item.ID] = item.State

			select {
			case events <- TransferEvent{Type: kind, Item: transferItem(item)}:
				return true
			case <-ctx.Done():
				return false
			}
		}

		for {
			// Replaying the subscription snapshot repairs any dropped updates.
			for _, item := range subscription.Snapshot {
				if !send(item, true) {
					return
				}
			}

		consume:
			for {
				select {
				case <-ctx.Done():
					return
				case event, open := <-subscription.Events:
					if !open {
						break consume
					}
					if event.Transfer != nil && !send(*event.Transfer, false) {
						return
					}
				}
			}

			select {
			case <-ctx.Done():
				return
			case <-adapter.manager.Done():
				return
			default:
			}

			subscription.Close()
			subscription = adapter.manager.Subscribe()
		}
	}()

	return events, stop
}

func (adapter *managedTransfers) Close() error {
	adapter.cancel()
	return adapter.manager.Close()
}
