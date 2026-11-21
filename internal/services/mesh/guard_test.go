package mesh

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

func member(name string, order uint64) peer.ShareMember {
	private := key.NewNode()
	address := tailcat.ConnInfo{
		ServerPublic:      tailcat.NodePublic{NodePublic: private.Public()},
		ServerDiscoPublic: tailcat.DiscoPublicForNode(private),
		PresharedKey:      tailcat.NewPresharedKey(), RegionID: 1,
	}
	return peer.ShareMember{
		ID: private.Public().String(), DisplayName: name,
		Address: string(address.Addr()), JoinOrder: order,
	}
}

func raw(value any) json.RawMessage {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return encoded
}

func wantCode(t *testing.T, err error, code string) {
	t.Helper()
	var remote *peer.RemoteError
	if !errors.As(err, &remote) || remote.Code != code {
		t.Fatalf("error = %v, want %s", err, code)
	}
}

func TestRosterFromPeerRefused(t *testing.T) {
	self := member("Self", 1)
	other := member("Other", 2)
	cases := map[string][]peer.ShareMember{
		"empty":           nil,
		"missing self":    {other},
		"duplicate id":    {self, self},
		"duplicate order": {self, member("Duplicate", 1)},
	}
	for _, change := range []string{"address", "identity", "long name", "control", "zero order", "self address"} {
		changed := other
		switch change {
		case "address":
			changed.Address = "../../outside"
		case "identity":
			changed.ID = self.ID
		case "long name":
			changed.DisplayName = strings.Repeat("x", 65)
		case "control":
			changed.DisplayName = "Bad\x00name"
		case "zero order":
			changed.JoinOrder = 0
		case "self address":
			changed = self
			changed.Address = other.Address
		}
		cases[change] = []peer.ShareMember{self, changed}
	}
	many := []peer.ShareMember{self}
	for i := 2; i <= 9; i++ {
		many = append(many, member(fmt.Sprint(i), uint64(i)))
	}
	cases["nine members"] = many

	for name, entries := range cases {
		t.Run(name, func(t *testing.T) {
			mesh := &Mesh{self: self}
			wantCode(t, mesh.SetRoster(peer.ShareRoster{Members: entries}), peer.CodeBadRequest)
		})
	}
	mesh := &Mesh{self: self}
	initial := peer.ShareRoster{Members: []peer.ShareMember{other, self}}
	if err := mesh.SetRoster(initial); err != nil {
		t.Fatal(err)
	}
	snapshot := mesh.Roster()
	snapshot.Members[0].DisplayName = "Changed"
	if mesh.Roster().Members[0] != self {
		t.Fatal("roster returned mutable state")
	}
}

func TestAdmitOnlyFromAdmitter(t *testing.T) {
	mesh := localMesh(t, nil, "Host")
	payload := admissionPayload(member("Joiner", 2), key.NewNode().Public().String())
	handler := mesh.Handlers(member("Unknown", 1).ID)[peer.MethodShareAdmit]
	_, err := handler(t.Context(), raw(payload))
	wantCode(t, err, peer.CodeNotAdmitter)

	host := mesh.Self()
	second := member("Second", 2)
	initial := peer.ShareRoster{Members: []peer.ShareMember{host, second}}
	if err := mesh.SetRoster(initial); err != nil {
		t.Fatal(err)
	}
	payload = admissionPayload(member("Third", 3), key.NewNode().Public().String())
	_, err = mesh.Handlers(second.ID)[peer.MethodShareAdmit](t.Context(), raw(payload))
	wantCode(t, err, peer.CodeNotAdmitter)
}

func admissionPayload(joiner peer.ShareMember, linkKey string) peer.ShareAdmit {
	return peer.ShareAdmit{
		JoinerID: joiner.ID, JoinerName: joiner.DisplayName,
		JoinerAddress: joiner.Address, JoinOrder: joiner.JoinOrder, LinkKey: linkKey,
	}
}

func TestAdmissionAbuse(t *testing.T) {
	mesh := localMesh(t, nil, "Host")
	host := mesh.Self()
	handler := mesh.Handlers(host.ID)[peer.MethodShareAdmit]
	joiner := member("Joiner", 2)
	good := admissionPayload(joiner, key.NewNode().Public().String())
	cases := map[string]json.RawMessage{
		"oversize":      json.RawMessage(strings.Repeat(" ", peer.MaxSharePayload+1)),
		"null":          json.RawMessage("null"),
		"unknown field": json.RawMessage(`{"claimedMember":"host"}`),
	}
	for _, name := range []string{"reused server key", "own server key", "wrong address", "bad key", "old order", "bad name"} {
		changed := good
		switch name {
		case "reused server key":
			changed.LinkKey = host.ID
		case "own server key":
			changed.LinkKey = joiner.ID
		case "wrong address":
			changed.JoinerAddress = host.Address
		case "bad key":
			changed.LinkKey = "../key"
		case "old order":
			changed.JoinOrder = 1
		case "bad name":
			changed.JoinerName = "bad\nname"
		}
		cases[name] = raw(changed)
	}
	for name, payload := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := handler(t.Context(), payload)
			wantCode(t, err, peer.CodeBadRequest)
			if len(mesh.Roster().Members) != 1 {
				t.Fatal("invalid admission changed roster")
			}
		})
	}
	if _, err := handler(t.Context(), raw(good)); err != nil {
		t.Fatal(err)
	}
	if err := mesh.Remove(joiner.ID); err != nil {
		t.Fatal(err)
	}
	good.JoinerID = member("New", 3).ID
	// Even a removed member's key cannot be recycled.
	_, err := handler(t.Context(), raw(good))
	wantCode(t, err, peer.CodeBadRequest)
}

func TestNinthPersonRefused(t *testing.T) {
	mesh := localMesh(t, nil, "Host")
	entries := []peer.ShareMember{mesh.Self()}
	for i := 2; i <= 8; i++ {
		entries = append(entries, member(fmt.Sprint(i), uint64(i)))
	}
	if err := mesh.SetRoster(peer.ShareRoster{Members: entries}); err != nil {
		t.Fatal(err)
	}
	ninth := member("Ninth", 9)
	_, err := mesh.BeginAdmission(ninth)
	wantCode(t, err, peer.CodeShareFull)
	_, err = mesh.Handlers(mesh.Self().ID)[peer.MethodShareAdmit](
		t.Context(), raw(admissionPayload(ninth, key.NewNode().Public().String())),
	)
	wantCode(t, err, peer.CodeShareFull)
}

func TestLinksMustMatchRoster(t *testing.T) {
	mesh := localMesh(t, nil, "Host")
	second := member("Second", 2)
	initial := peer.ShareRoster{Members: []peer.ShareMember{mesh.Self(), second}}
	if err := mesh.SetRoster(initial); err != nil {
		t.Fatal(err)
	}
	admission, err := mesh.BeginAdmission(member("Joiner", 3))
	if err != nil {
		t.Fatal(err)
	}
	defer admission.Close()

	if _, err := mesh.BeginAdmission(member("Another", 3)); err == nil {
		t.Fatal("second admission was not busy")
	} else {
		wantCode(t, err, peer.CodeBusy)
	}
	keyA, keyB := key.NewNode().Public().String(), key.NewNode().Public().String()
	good := []peer.ShareLink{{ID: mesh.Self().ID, LinkKey: keyA}, {ID: second.ID, LinkKey: keyB}}
	cases := map[string][]peer.ShareLink{
		"missing": good[:1],
		"extra": append(append([]peer.ShareLink(nil), good...), peer.ShareLink{
			ID: "unknown", LinkKey: keyB,
		}),
		"unknown id":    {{ID: "unknown", LinkKey: keyA}, good[1]},
		"duplicate id":  {good[0], good[0]},
		"duplicate key": {good[0], {ID: second.ID, LinkKey: keyA}},
		"server key":    {{ID: mesh.Self().ID, LinkKey: second.ID}, good[1]},
		"joiner key":    {{ID: mesh.Self().ID, LinkKey: admission.joiner.ID}, good[1]},
	}
	handler := admission.Handlers()[peer.MethodShareLinks]
	for name, links := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := handler(t.Context(), raw(peer.ShareLinks{Links: links}))
			wantCode(t, err, peer.CodeBadRequest)
		})
	}
	_, err = handler(t.Context(), json.RawMessage(strings.Repeat("x", peer.MaxSharePayload+1)))
	wantCode(t, err, peer.CodeBadRequest)
	// An unreachable member is removed so the new joiner can proceed.
	_, err = handler(t.Context(), raw(peer.ShareLinks{Links: good}))
	if err != nil {
		t.Fatal(err)
	}
	if mesh.Roster().Members[1].ID == second.ID {
		t.Fatal("unreachable member retained")
	}
	if len(mesh.Roster().Members) != 2 {
		t.Fatal("failed admission kept the joiner")
	}
}

func TestPreparedMemberExpires(t *testing.T) {
	mesh := localMesh(t, nil, "Host")
	joiner := member("Missing", 2)
	handler := mesh.Handlers(mesh.Self().ID)[peer.MethodShareAdmit]
	if _, err := handler(
		t.Context(),
		raw(admissionPayload(joiner, key.NewNode().Public().String())),
	); err != nil {
		t.Fatal(err)
	}
	mesh.mu.Lock()
	mesh.expiry[joiner.ID].Reset(time.Millisecond)
	mesh.mu.Unlock()
	deadline, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()

	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()

	for len(mesh.Roster().Members) != 1 {
		select {
		case <-ticker.C:
		case <-deadline.Done():
			t.Fatal("unlinked joiner never expired")
		}
	}
	mesh.mu.Lock()
	defer mesh.mu.Unlock()

	if len(mesh.expected) != 0 {
		t.Fatal("expired joiner kept expected keys")
	}
}

func TestLeaveCannotNameAnotherMember(t *testing.T) {
	mesh := localMesh(t, nil, "Host")
	sender, other := member("Sender", 2), member("Other", 3)
	initial := peer.ShareRoster{Members: []peer.ShareMember{mesh.Self(), sender, other}}
	if err := mesh.SetRoster(initial); err != nil {
		t.Fatal(err)
	}
	event := peer.Event{Kind: peer.EventShare, Method: peer.MethodShareLeave}
	event.Params = raw(map[string]string{"id": other.ID})
	wantCode(t, mesh.HandleEvent(sender.ID, event), peer.CodeBadRequest)
	event.Params = raw(peer.ShareLeave{})
	wantCode(t, mesh.HandleEvent("unknown", event), peer.CodeBadRequest)
	if err := mesh.HandleEvent(sender.ID, event); err != nil {
		t.Fatal(err)
	}
	roster := mesh.Roster()
	if len(roster.Members) != 2 || roster.Members[1].ID != other.ID {
		t.Fatal("leave removed someone besides its authenticated sender")
	}
}

func TestFailedAdmissionConsumesOrderAndKeys(t *testing.T) {
	mesh := localMesh(t, nil, "Host")
	second := member("Second", 2)
	initial := peer.ShareRoster{Members: []peer.ShareMember{mesh.Self(), second}}
	if err := mesh.SetRoster(initial); err != nil {
		t.Fatal(err)
	}
	first, err := mesh.BeginAdmission(member("First attempt", 0))
	if err != nil {
		t.Fatal(err)
	}
	keys := []peer.ShareLink{
		{ID: mesh.Self().ID, LinkKey: key.NewNode().Public().String()},
		{ID: second.ID, LinkKey: key.NewNode().Public().String()},
	}
	_, err = first.Handlers()[peer.MethodShareLinks](t.Context(), raw(peer.ShareLinks{Links: keys}))
	if err != nil {
		t.Fatal(err)
	}
	_, err = mesh.BeginAdmission(first.joiner)
	wantCode(t, err, peer.CodeBadRequest)
	retry, err := mesh.BeginAdmission(member("Retry", 0))
	if err != nil {
		t.Fatal(err)
	}
	defer retry.Close()

	if retry.joiner.JoinOrder <= first.joiner.JoinOrder {
		t.Fatal("failed admission's order was reused")
	}
	_, err = retry.Handlers()[peer.MethodShareLinks](t.Context(), raw(peer.ShareLinks{Links: keys}))
	wantCode(t, err, peer.CodeBadRequest)
}

func TestClosedAdmissionCannotPrepareLinks(t *testing.T) {
	mesh := localMesh(t, nil, "Host")
	admission, err := mesh.BeginAdmission(member("Joiner", 0))
	if err != nil {
		t.Fatal(err)
	}
	admission.Close()
	_, err = admission.Handlers()[peer.MethodShareRoster](t.Context(), nil)
	wantCode(t, err, peer.CodeJoinFailed)
	_, err = admission.Handlers()[peer.MethodShareLinks](t.Context(), raw(peer.ShareLinks{}))
	wantCode(t, err, peer.CodeJoinFailed)
}

func TestIsAdmitter(t *testing.T) {
	mesh := localMesh(t, nil, "Self")
	if !mesh.IsAdmitter() {
		t.Fatal("initial member is not admitter")
	}
	self := mesh.Self()
	first := member("First", 1)
	self.JoinOrder = 2
	if err := mesh.SetRoster(peer.ShareRoster{Members: []peer.ShareMember{first, self}}); err != nil {
		t.Fatal(err)
	}
	if mesh.IsAdmitter() {
		t.Fatal("later member is admitter")
	}
	if err := mesh.Remove(first.ID); err != nil {
		t.Fatal(err)
	}
	if !mesh.IsAdmitter() {
		t.Fatal("lowest survivor is not admitter")
	}
	_ = mesh.Close()
	if mesh.IsAdmitter() {
		t.Fatal("closed mesh is admitter")
	}
}
