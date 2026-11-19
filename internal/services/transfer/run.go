package transfer

import (
	"context"
	"errors"
	"time"

	"github.com/Polyphron-AI/tailshare/internal/services/peer"
)

func (manager *Manager) run(item *job, initiate bool) {
	err := manager.execute(item, initiate)
	manager.finish(item, err)
}

func (manager *Manager) execute(item *job, initiate bool) error {
	if initiate {
		if err := manager.negotiate(item); err != nil {
			return err
		}
	} else if item.sender {
		timer := time.NewTimer(streamTimeout)
		defer timer.Stop()
		select {
		case offset := <-item.resume:
			manager.mu.Lock()
			item.view.Offset, item.view.Bytes = offset, offset
			manager.mu.Unlock()
		case <-item.ctx.Done():
			return errDropped
		case <-timer.C:
			return errDropped
		}
	}

	conn, err := manager.stream(item)
	if err != nil {
		return err
	}
	defer conn.Close()
	manager.mu.Lock()
	item.conn = conn
	if item.ctx.Err() != nil {
		manager.mu.Unlock()
		return errDropped
	}
	item.view.State = Running
	item.started = time.Now()
	manager.emitLocked(item)
	manager.mu.Unlock()
	stop := context.AfterFunc(item.ctx, func() { _ = conn.Close() })
	defer stop()

	if item.sender {
		if err := manager.send(item, conn); err != nil {
			return err
		}
		// Closing signals EOF; completion still requires the receiver's verdict.
		_ = conn.Close()
		timer := time.NewTimer(verdictTimeout)
		defer timer.Stop()
		select {
		case err := <-item.verdict:
			return err
		case <-item.ctx.Done():
			return errDropped
		case <-timer.C:
			return errDropped
		}
	}

	manager.mu.Lock()
	offset, size, hash := item.view.Offset, item.view.Size, item.hash
	manager.mu.Unlock()
	err = receiveTo(manager.root, item.local, offset, size, progressReader{conn, manager, item})
	if err == nil {
		err = verifyPartial(manager.root, item.local, hash)
	}
	if err == nil {
		manager.mu.Lock()
		// Serialize publication with cancel: a completed file is never canceled afterward.
		if item.ctx.Err() != nil {
			err = errDropped
		} else {
			err = manager.root.Commit(item.local)
			if err != nil {
				_ = manager.root.RemovePartial(item.local)
			}
			if err == nil {
				item.view.State = Done
			}
		}
		manager.mu.Unlock()
	}
	if err != nil {
		_ = manager.peer.Notify(peer.MethodTransferFailed, peer.TransferFailed{
			TransferID: item.view.ID, Reason: err.Error(),
		})
	} else {
		_ = manager.peer.Notify(
			peer.MethodTransferComplete,
			peer.TransferComplete{TransferID: item.view.ID},
		)
	}
	return err
}

func (manager *Manager) negotiate(item *job) error {
	if err := manager.register(item); err != nil {
		return err
	}
	if item.sender {
		if err := manager.prepareSender(item); err != nil {
			return err
		}
	} else {
		if _, err := manager.root.Stat(item.local); err == nil {
			return errors.New("A file with that name already exists.")
		}
	}
	manager.mu.Lock()
	offer := peer.TransferOffer{
		TransferID: item.view.ID, Path: item.view.PeerPath, Direction: item.view.Direction,
		Size: item.view.Size, SHA256: item.hash,
	}
	manager.mu.Unlock()
	var answer peer.TransferAccept
	ctx, cancel := context.WithTimeout(item.ctx, streamTimeout)
	defer cancel()
	for {
		if err := manager.peer.Call(ctx, peer.MethodTransferOffer, offer, &answer); err != nil {
			return errDropped
		}
		if answer.TransferID != item.view.ID || !validID(answer.TransferID) {
			return errInvalid
		}
		if answer.Accepted || answer.Reason != errBusy.Error() {
			break
		}

		// A receiver can finish before the sender consumes its verdict. Keep this
		// queued start pending until the remote slot releases, bounded by ctx.
		timer := time.NewTimer(admissionRetry)
		select {
		case <-timer.C:
		case <-ctx.Done():
			timer.Stop()
			return errBusy
		}
	}
	if !answer.Accepted {
		// Refusals use bounded local prose rather than reflecting arbitrary peer strings.
		return errors.New("The other computer could not accept this transfer.")
	}
	if item.sender {
		manager.mu.Lock()
		defer manager.mu.Unlock()
		if answer.Offset < 0 || answer.Offset > item.view.Size {
			return errInvalid
		}
		item.view.Offset, item.view.Bytes = answer.Offset, answer.Offset
		return nil
	}
	if answer.Size < 0 || answer.Size > maxFileSize || !validHash(answer.SHA256) {
		return errInvalid
	}
	manager.mu.Lock()
	item.view.Size, item.hash = answer.Size, answer.SHA256
	manager.mu.Unlock()
	if err := manager.prepareReceiver(item); err != nil {
		return err
	}
	manager.mu.Lock()
	resume := peer.TransferResume{
		TransferID: item.view.ID, Offset: item.view.Offset, SHA256: item.hash,
	}
	manager.mu.Unlock()
	if err := manager.peer.Call(ctx, peer.MethodTransferResume, resume, nil); err != nil {
		return errDropped
	}
	return nil
}

func (manager *Manager) finish(item *job, err error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	delete(manager.waiters, item.view.ID)
	if item.waiter != nil {
		select {
		case conn := <-item.waiter:
			_ = conn.Close()
		default:
		}
	}
	if item.view.State != Paused && item.view.State != Canceled {
		if err == nil {
			item.view.State = Done
		} else {
			item.view.State, item.view.Reason = Failed, err.Error()
		}
	}
	if item.view.State == Canceled && !item.sender {
		_ = manager.root.RemovePartial(item.local)
	}
	item.cancel()
	manager.emitLocked(item)
	item.working = false
	close(item.done)
	manager.scheduleLocked()
}
