package transfer

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"net"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/share"
)

const (
	maxActive            = 2
	maxFileSize    int64 = 1 << 40
	streamTimeout        = 30 * time.Second
	headerTimeout        = 10 * time.Second
	verdictTimeout       = 30 * time.Second
	admissionRetry       = 25 * time.Millisecond
)

type job struct {
	working bool
	view    Transfer
	local   string
	hash    string
	sender  bool
	ctx     context.Context
	cancel  context.CancelFunc
	done    chan struct{}
	conn    net.Conn
	waiter  chan net.Conn
	verdict chan error
	resume  chan int64
	started time.Time
	last    time.Time
}

// Tunnel is one member's data stream link. Only the dialer opens streams.
type Tunnel interface {
	Open(context.Context) (net.Conn, error)
	Accept() (net.Conn, error)
}

// Manager owns one session's transfers and the shared folder used in both directions.
type Manager struct {
	mu          sync.Mutex
	root        *share.Root
	tunnel      Tunnel
	peer        *peer.Peer
	host        bool
	ctx         context.Context
	cancel      context.CancelFunc
	jobs        map[string]*job
	order       []string
	waiters     map[string]chan net.Conn
	subscribers map[*Subscription]struct{}
	attached    bool
	closed      bool
	closeDone   chan struct{}
}

// New prepares handlers before peer.Start. The caller owns the shared folder.
func New(root *share.Root) *Manager {
	ctx, cancel := context.WithCancel(context.Background())
	return &Manager{
		root:        root,
		ctx:         ctx,
		cancel:      cancel,
		jobs:        make(map[string]*job),
		closeDone:   make(chan struct{}),
		waiters:     make(map[string]chan net.Conn),
		subscribers: make(map[*Subscription]struct{}),
	}
}

// Done closes when the manager stops, including peer loss.
func (manager *Manager) Done() <-chan struct{} { return manager.ctx.Done() }

// Handlers returns the request handlers to pass to peer.Start.
func (manager *Manager) Handlers() map[string]peer.Handler {
	return map[string]peer.Handler{
		peer.MethodTransferOffer:  manager.offer,
		peer.MethodTransferResume: manager.resumeOffer,
	}
}

// Attach connects the manager after hello; host is true on the accepting computer.
func (manager *Manager) Attach(ctx context.Context, tunnel Tunnel, conversation *peer.Peer, host bool) error {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.attached || manager.closed {
		return errInvalid
	}

	manager.tunnel, manager.peer, manager.host = tunnel, conversation, host
	manager.attached = true
	subscription := conversation.Subscribe()
	go manager.events(subscription)
	go func() {
		select {
		case <-ctx.Done():
		case <-conversation.Done():
		case <-manager.ctx.Done():
		}
		_ = manager.Close()
	}()
	if host {
		go manager.acceptLoop()
	}
	manager.scheduleLocked()
	return nil
}

// Upload queues a shared local file for delivery to the peer path.
func (manager *Manager) Upload(ctx context.Context, local, remote string) (Transfer, error) {
	return manager.enqueue(ctx, local, remote, peer.DirectionUpload)
}

// Download queues a peer file for delivery to a path in the local shared folder.
func (manager *Manager) Download(ctx context.Context, remote, local string) (Transfer, error) {
	return manager.enqueue(ctx, local, remote, peer.DirectionDownload)
}

func (manager *Manager) enqueue(ctx context.Context, local, remote string, direction peer.Direction) (Transfer, error) {
	if ctx.Err() != nil {
		return Transfer{}, errDropped
	}
	if manager.root == nil {
		return Transfer{}, errors.New("Choose a shared folder first.")
	}
	for _, name := range []string{local, remote} {
		if _, err := share.Localize(name); err != nil || name == "" {
			return Transfer{}, share.ErrBadPath
		}
	}

	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.closed {
		return Transfer{}, errDropped
	}
	item := manager.newJobLocked(rand.Text(), local, remote, direction, true)
	manager.scheduleLocked()
	return item.view, nil
}

func (manager *Manager) newJobLocked(id, local, remote string, direction peer.Direction, initiator bool) *job {
	ctx, cancel := context.WithCancel(manager.ctx)
	item := &job{
		view: Transfer{ID: id, Direction: direction, Initiator: initiator,
			Name: path.Base(local), LocalPath: local, PeerPath: remote, State: Queued},
		local: local, ctx: ctx, cancel: cancel, done: make(chan struct{}),
		verdict: make(chan error, 1), resume: make(chan int64, 1),
	}
	item.sender = (direction == peer.DirectionUpload) == initiator
	manager.jobs[id] = item
	manager.order = append(manager.order, id)
	manager.emitLocked(item)
	return item
}

func (manager *Manager) slotsLocked() int {
	count := 0
	for _, item := range manager.jobs {
		if item.working {
			count++
		}
	}
	return count
}

func (manager *Manager) destinationBusyLocked(local string, except *job) bool {
	for _, item := range manager.jobs {
		if item != except && !item.sender && item.working && strings.EqualFold(item.local, local) {
			return true
		}
	}
	return false
}

func (manager *Manager) scheduleLocked() {
	if !manager.attached || manager.closed {
		return
	}
	for _, id := range manager.order {
		if manager.slotsLocked() >= maxActive {
			return
		}
		item := manager.jobs[id]
		if item.view.State != Queued {
			continue
		}
		if !item.sender && manager.destinationBusyLocked(item.local, item) {
			continue
		}

		item.view.State = Starting
		item.working = true
		manager.emitLocked(item)
		go manager.run(item, true)
	}
}

// Snapshot returns transfers in queue order.
func (manager *Manager) Snapshot() []Transfer {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.snapshotLocked()
}

func (manager *Manager) snapshotLocked() []Transfer {
	result := make([]Transfer, 0, len(manager.order))
	for _, id := range manager.order {
		result = append(result, manager.jobs[id].view)
	}
	return result
}

// Pause stops an initiated transfer and keeps the receiver's unfinished file.
func (manager *Manager) Pause(id string) error { return manager.stop(id, Paused, true) }

// Cancel stops a transfer and removes its unfinished file on the receiver.
func (manager *Manager) Cancel(id string) error { return manager.stop(id, Canceled, true) }

func (manager *Manager) stop(id string, state State, notify bool) error {
	manager.mu.Lock()
	item := manager.jobs[id]
	if item == nil || item.view.State == Done || item.view.State == Canceled {
		manager.mu.Unlock()
		return errUnknown
	}
	if state == Paused && !item.view.Initiator {
		manager.mu.Unlock()
		return errUnknown
	}
	wasActive := item.working
	if state == Canceled && !wasActive && !item.sender &&
		!manager.destinationBusyLocked(item.local, item) {
		_ = manager.root.RemovePartial(item.local)
	}
	item.view.State = state
	item.cancel()
	if item.conn != nil {
		_ = item.conn.Close()
	}
	manager.emitLocked(item)
	manager.mu.Unlock()

	if wasActive {
		<-item.done
	}
	if state == Canceled {
		if notify && manager.peer != nil {
			_ = manager.peer.Notify(peer.MethodTransferCancel, peer.TransferCancel{TransferID: id})
		}
	}
	manager.mu.Lock()
	manager.scheduleLocked()
	manager.mu.Unlock()
	return nil
}

// Resume queues a new attempt with a fresh ID, preserving the receiver's partial.
func (manager *Manager) Resume(id string) (Transfer, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	previous := manager.jobs[id]
	if previous == nil || !previous.view.Initiator ||
		(previous.view.State != Paused && previous.view.State != Failed) {
		return Transfer{}, errUnknown
	}
	if manager.closed {
		return Transfer{}, errDropped
	}

	// ponytail: retries are manual; a later policy can retry transient errors automatically.
	item := manager.newJobLocked(
		rand.Text(), previous.local, previous.view.PeerPath, previous.view.Direction, true,
	)
	manager.scheduleLocked()
	return item.view, nil
}

// Close stops all active work. It does not close the peer, session or shared folder.
func (manager *Manager) Close() error {
	manager.mu.Lock()
	if manager.closed {
		manager.mu.Unlock()
		<-manager.closeDone
		return nil
	}
	manager.closed = true
	manager.cancel()
	var waiting []chan struct{}
	for _, item := range manager.jobs {
		item.cancel()
		if item.conn != nil {
			_ = item.conn.Close()
		}
		if item.working {
			waiting = append(waiting, item.done)
		}
	}
	manager.mu.Unlock()
	for _, done := range waiting {
		<-done
	}
	manager.mu.Lock()
	for _, item := range manager.jobs {
		if item.view.State == Queued {
			item.view.State, item.view.Reason = Failed, errDropped.Error()
			manager.emitLocked(item)
		}
	}
	for subscription := range manager.subscribers {
		delete(manager.subscribers, subscription)
		close(subscription.ch)
	}
	close(manager.closeDone)
	manager.mu.Unlock()
	return nil
}

func (manager *Manager) events(subscription *peer.Subscription) {
	defer func() { subscription.Close() }()
	for {
		select {
		case <-manager.ctx.Done():
			return
		case event, open := <-subscription.Events:
			if !open {
				select {
				case <-manager.peer.Done():
					return
				default:
				}
				subscription.Close()
				subscription = manager.peer.Subscribe()
				continue
			}
			if event.Kind != peer.EventTransfer {
				continue
			}
			var message peer.TransferFailed
			if json.Unmarshal(event.Params, &message) != nil || !validID(message.TransferID) {
				continue
			}
			manager.mu.Lock()
			item := manager.jobs[message.TransferID]
			if item == nil {
				manager.mu.Unlock()
				continue
			}
			switch event.Method {
			case peer.MethodTransferComplete:
				if item.sender {
					select {
					case item.verdict <- nil:
					default:
					}
				}
			case peer.MethodTransferFailed:
				// Peer prose is untrusted; show our own bounded, plain sentence.
				if item.sender {
					select {
					case item.verdict <- errDropped:
					default:
					}
				}
			case peer.MethodTransferCancel:
				manager.mu.Unlock()
				_ = manager.stop(message.TransferID, Canceled, false)
				continue
			}
			manager.mu.Unlock()
		}
	}
}
