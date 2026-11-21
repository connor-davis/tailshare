package transfer

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
)

func validHash(hash string) bool {
	decoded, err := hex.DecodeString(hash)
	return err == nil && len(decoded) == 32
}

func (manager *Manager) offer(ctx context.Context, raw json.RawMessage) (any, error) {
	if err := manager.authorize(ctx, true); err != nil {
		return nil, err
	}
	var offer peer.TransferOffer
	if json.Unmarshal(raw, &offer) != nil || !validID(offer.TransferID) {
		return nil, &peer.RemoteError{Code: peer.CodeBadRequest, Message: errInvalid.Error()}
	}
	refusal := func(err error) (any, error) {
		return peer.TransferAccept{TransferID: offer.TransferID, Reason: err.Error()}, nil
	}
	if manager.root == nil {
		return refusal(errors.New("This computer is not sharing a folder."))
	}
	if offer.Path == "" {
		return refusal(share.ErrBadPath)
	}
	if _, err := share.Localize(offer.Path); err != nil {
		return refusal(err)
	}
	if offer.Direction != peer.DirectionUpload && offer.Direction != peer.DirectionDownload {
		return refusal(errInvalid)
	}
	if offer.Direction == peer.DirectionUpload &&
		(offer.Size < 0 || offer.Size > maxFileSize || !validHash(offer.SHA256)) {
		return refusal(errInvalid)
	}

	manager.mu.Lock()
	if !manager.attached || manager.closed {
		manager.mu.Unlock()
		return refusal(errDropped)
	}
	if _, known := manager.jobs[offer.TransferID]; known {
		manager.mu.Unlock()
		return refusal(errInvalid)
	}
	if manager.slotsLocked() >= manager.slots ||
		(offer.Direction == peer.DirectionUpload && manager.destinationBusyLocked(offer.Path, nil)) {
		manager.mu.Unlock()
		return refusal(errBusy)
	}
	item := manager.newJobLocked(offer.TransferID, offer.Path, offer.Path, offer.Direction, false)
	item.view.State = Starting
	item.working = true
	item.view.Size, item.hash = offer.Size, offer.SHA256
	manager.emitLocked(item)
	manager.mu.Unlock()

	var err error
	if item.sender {
		err = manager.prepareSender(item)
	} else {
		err = manager.prepareReceiver(item)
	}
	if err != nil {
		manager.refuse(item, err)
		return refusal(err)
	}
	if err := manager.register(item); err != nil {
		manager.refuse(item, err)
		return refusal(err)
	}

	manager.mu.Lock()
	answer := peer.TransferAccept{
		TransferID: offer.TransferID, Accepted: true,
		Size: item.view.Size, SHA256: item.hash, Offset: item.view.Offset,
	}
	manager.mu.Unlock()
	go manager.run(item, false)
	return answer, nil
}

func (manager *Manager) resumeOffer(ctx context.Context, raw json.RawMessage) (any, error) {
	if err := manager.authorize(ctx, false); err != nil {
		return nil, err
	}
	var resume peer.TransferResume
	if json.Unmarshal(raw, &resume) != nil || !validID(resume.TransferID) {
		return nil, &peer.RemoteError{Code: peer.CodeBadRequest, Message: errInvalid.Error()}
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	item := manager.jobs[resume.TransferID]
	if item == nil || item.view.Initiator || !item.sender || item.view.State != Starting ||
		resume.Offset < 0 || resume.Offset > item.view.Size || resume.SHA256 != item.hash {
		return nil, &peer.RemoteError{Code: peer.CodeBadRequest, Message: errInvalid.Error()}
	}
	select {
	case item.resume <- resume.Offset:
		return struct{}{}, nil
	default:
		return nil, &peer.RemoteError{Code: peer.CodeBadRequest, Message: errInvalid.Error()}
	}
}

func (manager *Manager) authorize(ctx context.Context, offer bool) error {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	if peer.Conversation(ctx) != manager.peer {
		return &peer.RemoteError{Code: peer.CodeDenied, Message: "This link cannot transfer files."}
	}
	if offer && manager.peer != nil {
		now := time.Now()
		if now.Sub(manager.offerWindow) >= time.Second {
			manager.offerWindow, manager.offerCount = now, 0
		}
		if manager.offerCount >= 4 {
			return &peer.RemoteError{Code: peer.CodeBusy, Message: "Try again shortly."}
		}
		manager.offerCount++
	}
	return nil
}

func (manager *Manager) refuse(item *job, err error) {
	manager.finish(item, err)
	manager.mu.Lock()
	defer manager.mu.Unlock()
	delete(manager.jobs, item.view.ID)
	for i, id := range manager.order {
		if id == item.view.ID {
			manager.order = append(manager.order[:i], manager.order[i+1:]...)
			break
		}
	}
}
