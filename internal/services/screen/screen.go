// Package screen carries view-only, memory-only recordings between room members.
package screen

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"sort"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
)

// Kind is the session stream kind for framed screen recordings.
const Kind byte = 2

// MaxChunk bounds a single media message, including its epoch flag.
const MaxChunk = 1 << 20

// MaxEpoch bounds the retained independently decodable recording in bytes.
const MaxEpoch = 4 << 20

// Item describes one member's active recording, never a native capture source.
type Item struct {
	ID        string `json:"id"`
	Codec     string `json:"codec"`
	OwnerID   string `json:"ownerId"`
	OwnerName string `json:"ownerName"`
	Viewers   int    `json:"viewers"`
}

// State is the room's current screen-sharing metadata.
type State struct {
	Mine        []Item   `json:"mine"`
	Others      []Item   `json:"others"`
	Unsupported []string `json:"unsupported"`
}

type recording struct {
	ID    string `json:"id"`
	Codec string `json:"codec"`
}

type listing struct {
	Rev   uint64     `json:"rev"`
	Share *recording `json:"share"`
}

type watch struct {
	owner string
	id    string
}

type viewer struct {
	conn  net.Conn
	queue chan []byte
	bytes int
}

// Screens owns the current recording and its independently bounded viewers.
type Screens struct {
	mu         sync.Mutex
	room       *session.Session
	ctx        context.Context
	cancel     context.CancelFunc
	changed    func()
	local      listing
	remote     map[string]listing
	known      map[string]bool
	legacy     map[string]bool
	viewers    map[string]*viewer
	watches    map[net.Conn]watch
	epoch      [][]byte
	epochBytes int
	ingest     func()
	closed     bool
}

// New creates a registry whose callback runs outside its lock.
func New(changed func()) *Screens {
	ctx, cancel := context.WithCancel(context.Background())
	return &Screens{ctx: ctx, cancel: cancel, changed: changed, remote: map[string]listing{},
		known: map[string]bool{}, legacy: map[string]bool{}, viewers: map[string]*viewer{},
		watches: map[net.Conn]watch{}}
}

// RoomHandlers adds optional version-2 screen methods to each authenticated conversation.
func (screens *Screens) RoomHandlers() map[string]peer.Handler {
	return map[string]peer.Handler{
		"screen.list": func(_ context.Context, raw json.RawMessage) (any, error) {
			if len(raw) > 16 {
				return nil, badList()
			}

			screens.mu.Lock()
			defer screens.mu.Unlock()
			return screens.local, nil
		},

		"screen.announce": func(ctx context.Context, raw json.RawMessage) (any, error) {
			sender := peer.Conversation(ctx)
			var list listing

			if sender == nil || len(raw) > 4096 || json.Unmarshal(raw, &list) != nil || !validList(list) {
				return nil, badList()
			}

			screens.apply(sender.MemberID(), list)
			return struct{}{}, nil
		},
	}
}

func badList() error {
	return &peer.RemoteError{Code: peer.CodeBadRequest, Message: "That screen share could not be understood."}
}

func validList(list listing) bool {
	if list.Share == nil {
		return true
	}

	raw, err := hex.DecodeString(list.Share.ID)
	return err == nil && len(raw) == 8 && hex.EncodeToString(raw) == list.Share.ID && validCodec(list.Share.Codec)
}

func validCodec(codec string) bool {
	return codec == "video/webm;codecs=vp8" || codec == "video/webm;codecs=vp9"
}

// Attach uses the session's shared stream routing in either link direction.
func (screens *Screens) Attach(room *session.Session) error {
	screens.mu.Lock()

	if screens.closed {
		screens.mu.Unlock()
		return net.ErrClosed
	}

	screens.room = room
	screens.mu.Unlock()

	if err := room.HandleStream(Kind, screens.serve); err != nil {
		return err
	}

	screens.Sync()
	return nil
}

// Sync discovers late joiners and removes shares and streams of departed members.
func (screens *Screens) Sync() {
	screens.mu.Lock()
	room, closed := screens.room, screens.closed
	screens.mu.Unlock()

	if room == nil || closed {
		return
	}

	present := map[string]bool{}

	for _, member := range room.Members() {
		if _, ok := room.Control(member.ID); ok {
			present[member.ID] = true
		}
	}

	screens.mu.Lock()
	var fresh []string

	for id := range present {
		if !screens.known[id] {
			screens.known[id] = true
			fresh = append(fresh, id)
		}
	}

	for id := range screens.known {
		if !present[id] {
			delete(screens.known, id)
			delete(screens.legacy, id)
		}
	}

	for id := range screens.remote {
		if !present[id] {
			delete(screens.remote, id)
		}
	}

	for id, view := range screens.viewers {
		if !present[id] {
			_ = view.conn.Close()
			delete(screens.viewers, id)
		}
	}

	screens.pruneLocked()
	screens.mu.Unlock()
	screens.notify()

	for _, id := range fresh {
		go screens.greet(room, id)
	}
}

func (screens *Screens) greet(room *session.Session, id string) {
	control, ok := room.Control(id)

	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(screens.ctx, 15*time.Second)
	defer cancel()

	var list listing
	err := control.Call(ctx, "screen.list", nil, &list)
	var remote *peer.RemoteError

	if errors.As(err, &remote) && remote.Code == peer.CodeUnknownMethod {
		screens.mu.Lock()

		if screens.known[id] {
			screens.legacy[id] = true
		}

		screens.mu.Unlock()
		screens.notify()
	} else if err == nil && validList(list) {
		screens.apply(id, list)
	}

	screens.mu.Lock()
	local := screens.local
	screens.mu.Unlock()
	_ = control.Call(ctx, "screen.announce", local, nil)
}

func (screens *Screens) apply(owner string, list listing) {
	screens.mu.Lock()

	if old, ok := screens.remote[owner]; ok && old.Rev >= list.Rev {
		screens.mu.Unlock()
		return
	}

	if !screens.closed {
		screens.remote[owner] = list
	}

	screens.pruneLocked()
	screens.mu.Unlock()
	screens.notify()
}

func (screens *Screens) pruneLocked() {
	for conn, watched := range screens.watches {
		list, exists := screens.remote[watched.owner]

		if !exists || list.Share == nil || list.Share.ID != watched.id {
			_ = conn.Close()
			delete(screens.watches, conn)
		}
	}
}

func (screens *Screens) notify() {
	if screens.changed != nil {
		screens.changed()
	}
}

func (screens *Screens) announce() {
	screens.notify()
	screens.mu.Lock()
	room, list := screens.room, screens.local
	screens.mu.Unlock()

	if room == nil {
		return
	}

	go func() {
		ctx, cancel := context.WithTimeout(screens.ctx, 15*time.Second)
		defer cancel()
		room.Broadcast(ctx, "screen.announce", list)
	}()
}

// Start reserves this member's single recording. Capture still needs local consent.
func (screens *Screens) Start(codec string) (Item, error) {
	screens.mu.Lock()

	if screens.room == nil || screens.closed || screens.local.Share != nil || !validCodec(codec) {
		screens.mu.Unlock()
		return Item{}, errors.New("Could not start sharing. Stop any existing screen share first.")
	}

	raw := make([]byte, 8)
	_, _ = rand.Read(raw)
	item := Item{ID: hex.EncodeToString(raw), Codec: codec}

	screens.local.Rev++
	screens.local.Share = &recording{ID: item.ID, Codec: item.Codec}
	screens.mu.Unlock()
	screens.announce()
	// A page that dies between reserving the share and opening ingest must not
	// leave a permanent sharing indicator behind.
	time.AfterFunc(10*time.Second, func() {
		screens.mu.Lock()
		unbound := screens.local.Share != nil && screens.local.Share.ID == item.ID && screens.ingest == nil
		screens.mu.Unlock()

		if unbound {
			screens.Stop(item.ID)
		}
	})
	return item, nil
}

// BindIngest permits only one local media producer and lets Stop close its socket.
func (screens *Screens) BindIngest(id string, closeSocket func()) bool {
	screens.mu.Lock()
	defer screens.mu.Unlock()

	if screens.closed || screens.local.Share == nil || screens.local.Share.ID != id || screens.ingest != nil {
		return false
	}

	screens.ingest = closeSocket
	return true
}

// Push fans out one immutable epoch-flagged message without waiting for a viewer.
// A new epoch begins with flag 1 and includes its WebM initialization segment.
func (screens *Screens) Push(id string, data []byte) error {
	if len(data) < 2 || len(data) > MaxChunk || data[0] > 1 {
		return badList()
	}

	screens.mu.Lock()

	if screens.closed || screens.local.Share == nil || screens.local.Share.ID != id {
		screens.mu.Unlock()
		return net.ErrClosed
	}

	if data[0] == 1 {
		screens.epoch = nil
		screens.epochBytes = 0
	}

	if (len(screens.epoch) == 0 && data[0] != 1) || screens.epochBytes+len(data) > MaxEpoch || len(screens.epoch) >= 32 {
		screens.mu.Unlock()
		return errors.New("The screen recording exceeded its memory limit.")
	}

	chunk := append([]byte(nil), data...)
	screens.epoch = append(screens.epoch, chunk)
	screens.epochBytes += len(chunk)
	dropped := false

	for member, view := range screens.viewers {
		if view.bytes+len(chunk) > MaxEpoch || len(view.queue) == cap(view.queue) {
			_ = view.conn.Close()
			delete(screens.viewers, member)

			dropped = true
			continue
		}

		view.bytes += len(chunk)
		view.queue <- chunk
	}

	screens.mu.Unlock()

	if dropped {
		screens.notify()
	}

	return nil
}

// Stop clears the recording and closes every viewer and the ingest socket.
func (screens *Screens) Stop(id string) {
	screens.mu.Lock()

	if screens.local.Share == nil || screens.local.Share.ID != id {
		screens.mu.Unlock()
		return
	}

	screens.local.Share = nil
	screens.local.Rev++
	screens.epoch = nil
	screens.epochBytes = 0
	ingest := screens.ingest
	screens.ingest = nil

	for member, view := range screens.viewers {
		_ = view.conn.Close()
		delete(screens.viewers, member)
	}

	screens.mu.Unlock()

	if ingest != nil {
		ingest()
	}

	screens.announce()
}

// State returns metadata with names from the authenticated roster, never peer claims.
func (screens *Screens) State() State {
	screens.mu.Lock()
	room := screens.room
	screens.mu.Unlock()
	names := map[string]string{}
	self := ""

	if room != nil {
		self = room.SelfID()

		for _, member := range room.Members() {
			names[member.ID] = member.DisplayName
		}
	}

	screens.mu.Lock()
	defer screens.mu.Unlock()
	state := State{Mine: []Item{}, Others: []Item{}, Unsupported: []string{}}

	if screens.local.Share != nil {
		item := Item{ID: screens.local.Share.ID, Codec: screens.local.Share.Codec}
		item.OwnerID, item.OwnerName, item.Viewers = self, names[self], len(screens.viewers)
		state.Mine = append(state.Mine, item)
	}

	owners := make([]string, 0, len(screens.remote))

	for owner := range screens.remote {
		owners = append(owners, owner)
	}

	sort.Strings(owners)
	seen := map[string]bool{}

	if screens.local.Share != nil {
		seen[screens.local.Share.ID] = true
	}

	for _, owner := range owners {
		list := screens.remote[owner]

		if list.Share != nil && names[owner] != "" && !seen[list.Share.ID] {
			item := Item{ID: list.Share.ID, Codec: list.Share.Codec}
			item.OwnerID, item.OwnerName, item.Viewers = owner, names[owner], 0

			state.Others = append(state.Others, item)
			seen[item.ID] = true
		}
	}

	for owner := range screens.legacy {
		if name := names[owner]; name != "" {
			state.Unsupported = append(state.Unsupported, name)
		}
	}

	sort.Slice(state.Others, func(i, j int) bool {
		return state.Others[i].OwnerID < state.Others[j].OwnerID
	})
	sort.Strings(state.Unsupported)
	return state
}

// Close releases all media and sockets on leave or session end.
func (screens *Screens) Close() {
	screens.cancel()
	screens.mu.Lock()
	screens.closed = true
	id := ""

	if screens.local.Share != nil {
		id = screens.local.Share.ID
	}

	for conn := range screens.watches {
		_ = conn.Close()
	}

	screens.remote = map[string]listing{}
	screens.mu.Unlock()
	screens.Stop(id)
}
