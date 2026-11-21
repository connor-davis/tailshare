// Package forward shares a local TCP port with the room and opens the ports
// other members share. Nothing here is written to disk.
package forward

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"net"
	"net/netip"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
)

// KindForward is the session stream kind of a forwarded connection. Its header
// is the share ID, and the sharer dials only the port in its own list for it.
const KindForward byte = 1

// Errors the screen may see. Each message is a plain sentence.
var (
	// ErrInvalid means the port or label was not usable.
	ErrInvalid = errors.New("Choose a port from 1 to 65535 and a label of 1 to 64 characters.")
	// ErrLimit means this computer already shares the most it can.
	ErrLimit = errors.New("You can share 16 apps at once. Stop one first.")
	// ErrNotFound means no such share is listed.
	ErrNotFound = errors.New("That app is not shared any more.")
	// ErrNotConnected means there is no room yet.
	ErrNotConnected = errors.New("Connect to another computer first.")
	// ErrUnreachable means the sharer could not be reached.
	ErrUnreachable = errors.New("Could not reach the computer that shares this app.")
)

// Item is one share as the screen draws it.
type Item struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	// Port is the sharer's own port. Viewers only show it.
	Port      int    `json:"port"`
	OwnerID   string `json:"ownerId"`
	OwnerName string `json:"ownerName"`
	// Open is true while this computer listens for the share.
	Open bool `json:"open"`
	// LocalPort is the 127.0.0.1 port while Open, else 0.
	LocalPort int `json:"localPort"`
}

// State is every share the screen needs.
type State struct {
	Mine   []Item `json:"mine"`
	Others []Item `json:"others"`
	// Unsupported names members whose Tailshare is too old to forward.
	Unsupported []string `json:"unsupported"`
}

type mine struct {
	share peer.ForwardShare
	// conns holds the streams from viewers and locals the local dials.
	conns  tracker
	locals tracker
}

type remote struct {
	rev    uint64
	shares []peer.ForwardShare
}

// Forwards is the room's port forwards: our shares, theirs, and what we opened.
type Forwards struct {
	mu      sync.Mutex
	room    *session.Session
	ctx     context.Context
	cancel  context.CancelFunc
	changed func()
	rev     uint64
	order   []string
	mine    map[string]*mine
	others  map[string]*remote
	known   map[string]bool
	legacy  map[string]bool
	opens   map[string]*opened
}

// New makes an empty registry. changed runs, never under the registry lock,
// after any change the screen should hear about.
func New(changed func()) *Forwards {
	ctx, cancel := context.WithCancel(context.Background())
	return &Forwards{
		ctx: ctx, cancel: cancel, changed: changed,
		mine: make(map[string]*mine), others: make(map[string]*remote),
		known: make(map[string]bool), legacy: make(map[string]bool), opens: make(map[string]*opened),
	}
}

// RoomHandlers are the peer methods to pass in session.Options.RoomHandlers.
func (forwards *Forwards) RoomHandlers() map[string]peer.Handler {
	return map[string]peer.Handler{
		peer.MethodForwardAnnounce: forwards.handleAnnounce,
		peer.MethodForwardList:     forwards.handleList,
	}
}

// Attach binds the session, starts serving forwarded streams and greets members.
func (forwards *Forwards) Attach(room *session.Session) error {
	forwards.mu.Lock()
	forwards.room = room
	forwards.mu.Unlock()

	if err := room.HandleStream(KindForward, forwards.serve); err != nil {
		return err
	}
	forwards.Sync()
	return nil
}

// Sync follows the roster: it greets members that just connected, so late
// joiners get existing shares, and forgets members that left. The caller runs
// it whenever the session reports a change.
func (forwards *Forwards) Sync() {
	forwards.mu.Lock()
	room := forwards.room
	forwards.mu.Unlock()
	if room == nil {
		return
	}

	self := room.SelfID()
	present := make(map[string]bool)
	for _, member := range room.Members() {
		if _, ok := room.Control(member.ID); ok && member.ID != self {
			present[member.ID] = true
		}
	}

	var fresh []string
	var gone []*opened
	changed := false

	forwards.mu.Lock()
	for id := range present {
		if !forwards.known[id] {
			forwards.known[id] = true
			fresh = append(fresh, id)
		}
	}
	for id := range forwards.known {
		if present[id] {
			continue
		}
		delete(forwards.known, id)
		delete(forwards.legacy, id)
		if _, had := forwards.others[id]; had {
			delete(forwards.others, id)
			changed = true
		}
		for shareID, open := range forwards.opens {
			if open.owner == id {
				gone = append(gone, open)
				delete(forwards.opens, shareID)
			}
		}
	}
	// A list can arrive before the member is known, so prune by the roster too.
	for id := range forwards.others {
		if !present[id] {
			delete(forwards.others, id)
			changed = true
		}
	}
	forwards.mu.Unlock()

	for _, open := range gone {
		open.close()
	}
	for _, id := range fresh {
		go forwards.greet(room, id)
	}
	if changed || len(gone) > 0 {
		forwards.notify()
	}
}

// greet asks a new member for its shares and tells it ours.
func (forwards *Forwards) greet(room *session.Session, id string) {
	control, ok := room.Control(id)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(forwards.ctx, 15*time.Second)
	defer cancel()

	var list peer.ForwardList
	if err := control.Call(ctx, peer.MethodForwardList, nil, &list); err != nil {
		forwards.markLegacy(id, err)
	} else {
		forwards.apply(id, list)
	}

	forwards.mu.Lock()
	mineNow := len(forwards.mine) > 0
	current := forwards.listLocked()
	forwards.mu.Unlock()
	if mineNow {
		forwards.markLegacy(id, control.Call(ctx, peer.MethodForwardAnnounce, current, nil))
	}
}

// markLegacy remembers that a member answered "unknown method".
func (forwards *Forwards) markLegacy(id string, err error) {
	var remoteErr *peer.RemoteError
	if !errors.As(err, &remoteErr) || remoteErr.Code != peer.CodeUnknownMethod {
		return
	}
	forwards.mu.Lock()
	forwards.legacy[id] = true
	forwards.mu.Unlock()
	forwards.notify()
}

// apply replaces one member's list when it is newer than what we hold, and
// closes opens whose share vanished.
func (forwards *Forwards) apply(owner string, list peer.ForwardList) {
	forwards.mu.Lock()
	if old, ok := forwards.others[owner]; ok && list.Rev <= old.rev {
		forwards.mu.Unlock()
		return
	}
	forwards.others[owner] = &remote{rev: list.Rev, shares: list.Shares}
	listed := make(map[string]bool, len(list.Shares))
	for _, share := range list.Shares {
		listed[share.ID] = true
	}
	var gone []*opened
	for shareID, open := range forwards.opens {
		if open.owner == owner && !listed[shareID] {
			gone = append(gone, open)
			delete(forwards.opens, shareID)
		}
	}
	forwards.mu.Unlock()

	for _, open := range gone {
		open.close()
	}
	forwards.notify()
}

func (forwards *Forwards) handleAnnounce(ctx context.Context, raw json.RawMessage) (any, error) {
	sender := peer.Conversation(ctx)
	if sender == nil || len(raw) > peer.MaxSharePayload {
		return nil, badRequest()
	}
	var list peer.ForwardList
	if json.Unmarshal(raw, &list) != nil || !validList(list) {
		return nil, badRequest()
	}

	forwards.apply(sender.MemberID(), list)
	return struct{}{}, nil
}

func (forwards *Forwards) handleList(ctx context.Context, _ json.RawMessage) (any, error) {
	forwards.mu.Lock()
	defer forwards.mu.Unlock()

	return forwards.listLocked(), nil
}

func badRequest() error {
	return &peer.RemoteError{Code: peer.CodeBadRequest, Message: "That list could not be understood."}
}

// validList checks every field a peer sent, since a list shows up on screen.
func validList(list peer.ForwardList) bool {
	if len(list.Shares) > peer.MaxForwardsPerMember {
		return false
	}
	seen := make(map[string]bool, len(list.Shares))
	for _, share := range list.Shares {
		if !validID(share.ID) || seen[share.ID] || !validPort(share.Port) {
			return false
		}
		if _, ok := cleanLabel(share.Label); !ok || share.Label != strings.TrimSpace(share.Label) {
			return false
		}
		seen[share.ID] = true
	}
	return true
}

func validID(id string) bool {
	if len(id) != 16 {
		return false
	}
	for _, char := range id {
		if !strings.ContainsRune("0123456789abcdef", char) {
			return false
		}
	}
	return true
}

func validPort(port int) bool { return port >= 1 && port <= 65535 }

// cleanLabel trims a label and says whether it can be shown: valid UTF-8,
// 1 to 64 characters, no control characters.
func cleanLabel(label string) (string, bool) {
	label = strings.TrimSpace(label)
	ok := label != "" && utf8.ValidString(label) &&
		utf8.RuneCountInString(label) <= peer.MaxForwardLabel &&
		!strings.ContainsFunc(label, unicode.IsControl)
	return label, ok
}

func (forwards *Forwards) listLocked() peer.ForwardList {
	list := peer.ForwardList{Rev: forwards.rev, Shares: make([]peer.ForwardShare, 0, len(forwards.order))}
	for _, id := range forwards.order {
		list.Shares = append(list.Shares, forwards.mine[id].share)
	}
	return list
}

// Share lists a local port for the whole room and tells every member.
func (forwards *Forwards) Share(port int, label string) (Item, error) {
	label, ok := cleanLabel(label)
	if !ok || !validPort(port) {
		return Item{}, ErrInvalid
	}

	raw := make([]byte, 8)
	_, _ = rand.Read(raw)
	share := peer.ForwardShare{ID: hex.EncodeToString(raw), Label: label, Port: port}

	forwards.mu.Lock()
	if forwards.room == nil {
		forwards.mu.Unlock()
		return Item{}, ErrNotConnected
	}
	if len(forwards.mine) >= peer.MaxForwardsPerMember {
		forwards.mu.Unlock()
		return Item{}, ErrLimit
	}
	forwards.mine[share.ID] = &mine{share: share}
	forwards.order = append(forwards.order, share.ID)
	forwards.rev++
	forwards.mu.Unlock()

	forwards.announce()
	return forwards.itemOf(share), nil
}

// Stop removes one of our shares, closes its live connections and tells the room.
func (forwards *Forwards) Stop(id string) error {
	forwards.mu.Lock()
	entry, ok := forwards.mine[id]
	if !ok {
		forwards.mu.Unlock()
		return ErrNotFound
	}
	delete(forwards.mine, id)
	forwards.order = removeString(forwards.order, id)
	forwards.rev++
	forwards.mu.Unlock()

	entry.conns.closeAll()
	entry.locals.closeAll()
	forwards.announce()
	return nil
}

func removeString(list []string, drop string) []string {
	kept := list[:0]
	for _, item := range list {
		if item != drop {
			kept = append(kept, item)
		}
	}
	return kept
}

// announce sends our whole list to everyone in the background. A member that
// does not know the method is remembered, so the screen can say so.
func (forwards *Forwards) announce() {
	forwards.notify()

	forwards.mu.Lock()
	room, list := forwards.room, forwards.listLocked()
	forwards.mu.Unlock()
	if room == nil {
		return
	}

	go func() {
		ctx, cancel := context.WithTimeout(forwards.ctx, 15*time.Second)
		defer cancel()
		for id, err := range room.Broadcast(ctx, peer.MethodForwardAnnounce, list) {
			forwards.markLegacy(id, err)
		}
	}()
}

func (forwards *Forwards) notify() {
	if forwards.changed != nil {
		forwards.changed()
	}
}

// itemOf builds our own item; it takes the lock itself.
func (forwards *Forwards) itemOf(share peer.ForwardShare) Item {
	forwards.mu.Lock()
	defer forwards.mu.Unlock()

	return Item{ID: share.ID, Label: share.Label, Port: share.Port, OwnerID: forwards.selfIDLocked()}
}

func (forwards *Forwards) selfIDLocked() string {
	if forwards.room == nil {
		return ""
	}
	return forwards.room.SelfID()
}

// State is the current picture for the screen.
func (forwards *Forwards) State() State {
	forwards.mu.Lock()
	room := forwards.room
	forwards.mu.Unlock()

	names := make(map[string]string)
	self := ""
	if room != nil {
		self = room.SelfID()
		for _, member := range room.Members() {
			names[member.ID] = member.DisplayName
		}
	}

	forwards.mu.Lock()
	defer forwards.mu.Unlock()

	state := State{Mine: []Item{}, Others: []Item{}, Unsupported: []string{}}
	for _, id := range forwards.order {
		share := forwards.mine[id].share
		state.Mine = append(state.Mine, Item{
			ID: share.ID, Label: share.Label, Port: share.Port, OwnerID: self, OwnerName: names[self],
		})
	}

	// Walk owners in a fixed order so a repeated share ID always hides the same one.
	owners := make([]string, 0, len(forwards.others))
	for owner := range forwards.others {
		owners = append(owners, owner)
	}
	sort.Strings(owners)

	seen := make(map[string]bool)
	for _, share := range forwards.order {
		seen[share] = true
	}
	for _, owner := range owners {
		for _, share := range forwards.others[owner].shares {
			if seen[share.ID] {
				continue
			}
			seen[share.ID] = true
			item := Item{
				ID: share.ID, Label: share.Label, Port: share.Port, OwnerID: owner, OwnerName: names[owner],
			}
			if open, ok := forwards.opens[share.ID]; ok && open.owner == owner {
				item.Open, item.LocalPort = true, open.port
			}
			state.Others = append(state.Others, item)
		}
	}
	for id := range forwards.legacy {
		if name, ok := names[id]; ok {
			state.Unsupported = append(state.Unsupported, name)
		}
	}
	sort.Strings(state.Unsupported)
	return state
}

// Close stops every share and listener. It is safe to call more than once.
func (forwards *Forwards) Close() {
	forwards.cancel()

	forwards.mu.Lock()
	mines := forwards.mine
	opens := forwards.opens
	forwards.mine, forwards.opens = make(map[string]*mine), make(map[string]*opened)
	forwards.order = nil
	forwards.mu.Unlock()

	for _, entry := range mines {
		entry.conns.closeAll()
		entry.locals.closeAll()
	}
	for _, open := range opens {
		open.close()
	}
}

// serve is the sharer's end of a forwarded stream. The header names a share
// and nothing else: the host and port come only from our own list, so a peer
// can never aim the dial at another address.
func (forwards *Forwards) serve(_ string, header []byte, conn net.Conn) {
	forwards.mu.Lock()
	entry := forwards.mine[string(header)]
	forwards.mu.Unlock()
	if entry == nil {
		_ = conn.Close()
		return
	}

	// ponytail: one cap for every viewer of a share; per-viewer caps are not built.
	if !entry.conns.add(conn, peer.MaxForwardConns*(peer.MaxShareMembers-1)) {
		_ = conn.Close()
		return
	}
	defer entry.conns.remove(conn)

	target := netip.AddrPortFrom(netip.AddrFrom4([4]byte{127, 0, 0, 1}), uint16(entry.share.Port))
	dialer := net.Dialer{Timeout: 5 * time.Second}
	local, err := dialer.DialContext(forwards.ctx, "tcp4", target.String())
	if err != nil {
		_ = conn.Close()
		return
	}
	if !entry.locals.add(local, math.MaxInt) {
		_ = local.Close()
		_ = conn.Close()
		return
	}
	defer entry.locals.remove(local)

	pipe(conn, local)
}
