package mesh

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"tailscale.com/types/key"
)

// AdmissionTimeout bounds preparation and removes members that never link.
const AdmissionTimeout = 30 * time.Second

// Admission is one locally approved joiner. Close it when its bootstrap ends.
// Its handlers must only be installed on that joiner's authenticated code stream.
type Admission struct {
	mu       sync.Mutex
	mesh     *Mesh
	joiner   peer.ShareMember
	roster   peer.ShareRoster
	closed   bool
	closedBy string // why the slot closed, for the joiner's details line
	timer    *time.Timer
	keys     map[string]key.NodePublic
	deadline time.Time
}

// BeginAdmission reserves the single admission slot after local Allow. The
// member's ID/address come from the authenticated join line; its order is assigned here.
func (mesh *Mesh) BeginAdmission(joiner peer.ShareMember) (*Admission, error) {
	mesh.mu.Lock()
	defer mesh.mu.Unlock()

	if mesh.closed || mesh.admitterLocked() != mesh.self.ID {
		return nil, notAdmitter()
	}
	if len(mesh.members) >= peer.MaxShareMembers {
		return nil, full()
	}
	if mesh.pending != nil {
		return nil, &peer.RemoteError{
			Code: peer.CodeBusy, Message: "Someone else is joining. Try again shortly.",
		}
	}
	if _, exists := mesh.members[joiner.ID]; exists {
		return nil, invalid()
	}

	last := max(mesh.lastOrder, mesh.nextOrder)
	if last == math.MaxUint64 {
		return nil, failure("no join order left")
	}
	joiner.JoinOrder = last + 1
	if err := validateMember(joiner); err != nil {
		return nil, err
	}
	public, _ := publicKey(joiner.ID)
	if mesh.keyUsedLocked(public) {
		return nil, invalid()
	}
	for _, member := range mesh.members {
		if strings.EqualFold(strings.TrimSpace(member.DisplayName), strings.TrimSpace(joiner.DisplayName)) {
			name := []rune(strings.TrimSpace(joiner.DisplayName))
			joiner.DisplayName = string(name[:min(len(name), 49)]) + " (" + peer.Fingerprint(joiner.ID) + ")"
			break
		}
	}
	proposed := mesh.rosterLocked()
	proposed.Members = append(proposed.Members, joiner)
	if _, err := validateRoster(proposed); err != nil {
		return nil, err
	}

	admission := &Admission{
		mesh: mesh, joiner: joiner, roster: mesh.rosterLocked(),
		deadline: time.Now().Add(AdmissionTimeout),
	}
	mesh.nextOrder = joiner.JoinOrder
	mesh.pending = admission
	admission.timer = time.AfterFunc(AdmissionTimeout, func() {
		admission.mu.Lock()
		defer admission.mu.Unlock()

		admission.closeLocked("the join took longer than 30 seconds after Allow")
	})
	return admission, nil
}

// Handlers answers roster and link preparation only for this approved joiner.
func (admission *Admission) Handlers() map[string]peer.Handler {
	return map[string]peer.Handler{
		peer.MethodShareRoster: admission.handleRoster,
		peer.MethodShareLinks:  admission.handleLinks,
	}
}

// Close releases the pending slot without removing any established member.
func (admission *Admission) Close() {
	admission.mu.Lock()
	defer admission.mu.Unlock()

	admission.closeLocked("the join stream to the host ended")
}

// closeLocked keeps the first reason, so a later close cannot hide why the slot shut.
func (admission *Admission) closeLocked(why string) {
	if !admission.closed {
		admission.closedBy = why
	}
	admission.closed = true
	if admission.timer != nil {
		admission.timer.Stop()
	}
	admission.mesh.mu.Lock()
	for _, public := range admission.keys {
		admission.mesh.used[public] = true
	}
	if len(admission.keys) != 0 {
		public, _ := publicKey(admission.joiner.ID)
		admission.mesh.used[public] = true
	}
	if admission.mesh.pending == admission {
		admission.mesh.pending = nil
	}
	admission.mesh.mu.Unlock()
}

func (admission *Admission) handleRoster(_ context.Context, raw json.RawMessage) (any, error) {
	admission.mu.Lock()
	defer admission.mu.Unlock()

	if len(raw) != 0 {
		if err := decode(raw, &peer.ShareLeave{}); err != nil {
			return nil, err
		}
	}
	admission.mesh.mu.Lock()
	current := admission.currentLocked()
	admission.mesh.mu.Unlock()
	if admission.closed {
		return nil, failure(admission.closedBy)
	}
	if !current {
		return nil, failure("the share changed before the roster was sent")
	}
	roster := peer.ShareRoster{
		Members: append([]peer.ShareMember(nil), admission.roster.Members...),
	}
	roster.Members = append(roster.Members, admission.joiner)
	return roster, nil
}

func (admission *Admission) handleLinks(ctx context.Context, raw json.RawMessage) (any, error) {
	admission.mu.Lock()
	defer admission.mu.Unlock()

	if admission.closed {
		return nil, failure(admission.closedBy)
	}
	var links peer.ShareLinks
	if err := decode(raw, &links); err != nil {
		return nil, err
	}
	mesh := admission.mesh
	mesh.mu.Lock()
	if !admission.currentLocked() {
		mesh.mu.Unlock()
		return nil, failure("the share changed before the links arrived")
	}
	keys, err := admission.checkLinksLocked(links)
	controls := make(map[string]*peer.Peer)
	for id, control := range mesh.controls {
		controls[id] = control
	}
	mesh.mu.Unlock()
	if err != nil {
		return nil, err
	}

	// Once offered, keys are burned even if only some recipients prepared them.
	admission.keys = keys
	bounded, cancel := context.WithDeadline(ctx, admission.deadline)
	defer cancel()

	removed := []string{}
	// Every remote must allow its key before the joiner is told to dial.
	// A partially prepared member expires if the joiner never opens that link.
	for _, member := range admission.roster.Members {
		if member.ID == mesh.self.ID {
			continue
		}
		control := controls[member.ID]
		payload := admission.payload(keys[member.ID])
		if control == nil || control.Call(bounded, peer.MethodShareAdmit, payload, nil) != nil {
			_ = mesh.Remove(member.ID)
			removed = append(removed, member.ID)
		}
	}
	if len(removed) != 0 {
		mesh.mu.Lock()
		admission.roster = mesh.rosterLocked()
		mesh.mu.Unlock()
	}

	mesh.mu.Lock()
	if !admission.currentLocked() {
		mesh.mu.Unlock()
		admission.closeLocked("")
		return nil, failure("the share changed while the links were prepared")
	}
	err = mesh.admitLocked(mesh.self.ID, admission.payload(keys[mesh.self.ID]))
	mesh.mu.Unlock()
	admission.closeLocked("")
	if err != nil {
		return nil, failure("the host could not add the link: " + err.Error())
	}
	return peer.ShareLinksResult{Removed: removed}, nil
}

func (admission *Admission) currentLocked() bool {
	mesh := admission.mesh
	if mesh.closed || mesh.pending != admission || mesh.admitterLocked() != mesh.self.ID ||
		len(mesh.members) != len(admission.roster.Members) {
		return false
	}
	for _, member := range admission.roster.Members {
		if mesh.members[member.ID] != member {
			return false
		}
	}
	return true
}

func (admission *Admission) checkLinksLocked(links peer.ShareLinks) (map[string]key.NodePublic, error) {
	mesh := admission.mesh
	if len(links.Links) != len(admission.roster.Members) {
		return nil, invalid()
	}
	keys := make(map[string]key.NodePublic)
	seen := make(map[key.NodePublic]bool)
	for _, link := range links.Links {
		public, err := publicKey(link.LinkKey)
		_, known := mesh.members[link.ID]
		if err != nil || !known || keys[link.ID] != (key.NodePublic{}) || seen[public] ||
			mesh.keyUsedLocked(public) || link.LinkKey == admission.joiner.ID {
			return nil, invalid()
		}
		keys[link.ID] = public
		seen[public] = true
	}
	return keys, nil
}

func (admission *Admission) payload(public key.NodePublic) peer.ShareAdmit {
	member := admission.joiner
	return peer.ShareAdmit{
		JoinerID: member.ID, JoinerName: member.DisplayName, JoinerAddress: member.Address,
		JoinOrder: member.JoinOrder, LinkKey: public.String(),
	}
}

// Handlers binds share.admit to the authenticated sender's member ID. Unknown
// identities never acquire the admitter's authority by claiming an ID in JSON.
func (mesh *Mesh) Handlers(sender string) map[string]peer.Handler {
	return map[string]peer.Handler{
		peer.MethodShareAdmit: func(_ context.Context, raw json.RawMessage) (any, error) {
			var payload peer.ShareAdmit
			if err := decode(raw, &payload); err != nil {
				return nil, err
			}
			mesh.mu.Lock()
			defer mesh.mu.Unlock()

			if err := mesh.admitLocked(sender, payload); err != nil {
				return nil, err
			}
			return struct{}{}, nil
		},
	}
}

func (mesh *Mesh) admitLocked(sender string, payload peer.ShareAdmit) error {
	if mesh.closed || sender != mesh.admitterLocked() {
		return notAdmitter()
	}
	if len(mesh.members) >= peer.MaxShareMembers {
		return full()
	}
	member := peer.ShareMember{
		ID: payload.JoinerID, DisplayName: payload.JoinerName,
		Address: payload.JoinerAddress, JoinOrder: payload.JoinOrder,
	}
	if err := validateMember(member); err != nil {
		return err
	}
	public, err := publicKey(payload.LinkKey)
	if err != nil || mesh.keyUsedLocked(public) || payload.LinkKey == member.ID {
		return invalid()
	}
	memberKey, _ := publicKey(member.ID)
	if mesh.keyUsedLocked(memberKey) {
		return invalid()
	}
	if _, exists := mesh.members[member.ID]; exists {
		return invalid()
	}
	if member.JoinOrder <= mesh.lastOrder {
		return invalid()
	}
	proposed := mesh.rosterLocked()
	proposed.Members = append(proposed.Members, member)
	if _, err := validateRoster(proposed); err != nil {
		return err
	}

	mesh.server.AddAllowedClient(public)
	mesh.expected[public] = member.ID
	mesh.used[public] = true
	mesh.used[memberKey] = true
	mesh.lastOrder = member.JoinOrder
	mesh.members[member.ID] = member
	mesh.expiry[member.ID] = time.AfterFunc(AdmissionTimeout, func() {
		mesh.mu.Lock()
		defer mesh.mu.Unlock()

		if mesh.expiry[member.ID] != nil {
			mesh.removeLocked(member.ID)
		}
	})
	return nil
}

func (mesh *Mesh) keyUsedLocked(public key.NodePublic) bool {
	if mesh.used[public] {
		return true
	}
	for _, link := range mesh.outgoing {
		if public.String() == link.PublicKey() {
			return true
		}
	}
	for id := range mesh.members {
		if public.String() == id {
			return true
		}
	}
	return false
}

func (mesh *Mesh) confirmLocked(id string) {
	if timer := mesh.expiry[id]; timer != nil {
		timer.Stop()
		delete(mesh.expiry, id)
	}
}

// HandleEvent applies a validated departure from the authenticated sender only.
// Session owns graceful-leave fanout, takeover and the close-at-one rule.
func (mesh *Mesh) HandleEvent(sender string, event peer.Event) error {
	if event.Kind != peer.EventShare || event.Method != peer.MethodShareLeave {
		return invalid()
	}
	if err := decode(event.Params, &peer.ShareLeave{}); err != nil {
		return err
	}
	return mesh.Remove(sender)
}
