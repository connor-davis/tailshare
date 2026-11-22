package api

import (
	"encoding/json"
	"testing"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/peer"
)

const (
	firstRoom  = "7K3Q-9PXM"
	secondRoom = "8K3Q-9PXM"
)

// twoRooms is a fixture whose active room is firstRoom, with secondRoom open beside it.
func twoRooms(t *testing.T) *fixture {
	t.Helper()

	f := newFixture(t, config.Config{}, newFake())
	f.server.mu.Lock()
	f.server.rooms[secondRoom] = &room{code: secondRoom, phase: phaseHosting, role: roleHost, roomName: "Second"}
	f.server.mu.Unlock()

	return f
}

func TestRoomByCode(t *testing.T) {
	f := twoRooms(t)

	got, err := f.server.roomByCode("")
	if err != nil || got == nil || got.code != firstRoom {
		t.Fatalf("empty = %v, %v", got, err)
	}

	// Any spelling of a code finds its room.
	got, err = f.server.roomByCode("8k3q 9pxm")
	if err != nil || got == nil || got.code != secondRoom {
		t.Fatalf("spelling = %v, %v", got, err)
	}

	if _, err := f.server.roomByCode("2222-2222"); err == nil || err.Error() != "That room is not open." {
		t.Fatalf("unknown = %v", err)
	}
	if _, err := f.server.roomByCode("zzz"); err == nil || err.Error() != "That room code is not valid." {
		t.Fatalf("bad = %v", err)
	}

	idle := newFixture(t, config.Config{}, nil)
	if got, err := idle.server.roomByCode(""); got != nil || err != nil {
		t.Fatalf("no active room = %v, %v", got, err)
	}
}

func TestRoomRoutesTakeAnOptionalRoom(t *testing.T) {
	f := twoRooms(t)

	// No room means the active room, so the old callers keep working.
	if state := f.send("GET", "/api/session", nil); state.Body["room"] != firstRoom {
		t.Fatalf("active = %s", state.Raw)
	}

	// The query names a room on GET and DELETE; the body does on POST and PUT.
	picked := f.send("GET", "/api/session?room=8k3q-9pxm", nil)
	picked.expect(t, 200, "")
	if picked.Body["room"] != secondRoom || picked.Body["state"] != phaseHosting {
		t.Fatalf("picked = %s", picked.Raw)
	}

	f.send("GET", "/api/session?room=2222-2222", nil).expect(t, 404, "not_found")
	f.send("GET", "/api/transfers?room=2222-2222", nil).expect(t, 404, "not_found")
	f.send("GET", "/api/chat?room=zzz", nil).expect(t, 400, "bad_request")
	f.send("POST", "/api/chat", map[string]any{"text": "hi", "room": "2222-2222"}).expect(t, 404, "not_found")
	f.send("POST", "/api/transfers", map[string]any{"room": "zzz"}).expect(t, 400, "bad_request")

	// The second room is open but not connected, and the first one is.
	f.send("GET", "/api/transfers?room="+secondRoom, nil).expect(t, 409, "not_connected")
	f.send("POST", "/api/transfers", map[string]any{
		"room": secondRoom, "direction": "upload", "source": "a", "destination": "a",
	}).expect(t, 409, "not_connected")
	f.server.mu.Lock()
	f.server.rooms[firstRoom].phase = phaseConnected
	f.server.mu.Unlock()
	f.send("GET", "/api/transfers?room="+firstRoom, nil).expect(t, 200, "")
}

func TestListRoomsAndSwitchActive(t *testing.T) {
	f := twoRooms(t)

	listed := f.send("GET", "/api/rooms", nil)
	listed.expect(t, 200, "")

	rooms, _ := listed.Body["rooms"].([]any)
	if listed.Body["active"] != firstRoom || len(rooms) != 2 ||
		rooms[0].(map[string]any)["room"] != firstRoom || rooms[1].(map[string]any)["room"] != secondRoom {
		t.Fatalf("rooms = %s", listed.Raw)
	}

	f.send("POST", "/api/rooms/active", map[string]string{"room": "2222-2222"}).expect(t, 404, "not_found")
	f.send("POST", "/api/rooms/active", map[string]string{"room": "zzz"}).expect(t, 400, "bad_request")
	f.send("POST", "/api/rooms/active", nil).expect(t, 400, "bad_request")

	live := f.dialLive()
	next(t, live)

	switched := f.send("POST", "/api/rooms/active", map[string]string{"room": "8k3q 9pxm"})
	switched.expect(t, 200, "")
	if switched.Body["room"] != secondRoom {
		t.Fatalf("switched = %s", switched.Raw)
	}

	event := until(t, live, "session.state", nil)
	if event.Room != secondRoom {
		t.Fatalf("event room = %q", event.Room)
	}

	// The idle screen's answer names no room, and the old shape still holds.
	f.send("GET", "/api/session", nil).expect(t, 200, "")
	if f.server.active != secondRoom {
		t.Fatalf("active = %q", f.server.active)
	}
}

func TestSnapshotListsRooms(t *testing.T) {
	f := twoRooms(t)
	live := f.dialLive()

	var got Snapshot
	data, err := json.Marshal(next(t, live).Data)
	if err != nil || json.Unmarshal(data, &got) != nil {
		t.Fatalf("%s: %v", data, err)
	}

	// The old session field is still the active room.
	if got.Active != firstRoom || len(got.Rooms) != 2 || got.Session.Room != firstRoom {
		t.Fatalf("snapshot = %s", data)
	}
}

func TestEventsCarryTheirRoom(t *testing.T) {
	fake := newFake()
	f := newFixture(t, config.Config{}, fake)
	live := f.dialLive()
	next(t, live)

	fake.events <- TransferEvent{Type: "transfer.state", Item: TransferItem{ID: "1", State: "done"}}
	if event := until(t, live, "transfer.state", nil); event.Room != firstRoom {
		t.Fatalf("transfer room = %q", event.Room)
	}

	fake.events <- TransferEvent{Type: "transfer.removed", IDs: []string{"1"}}
	if event := until(t, live, "transfer.removed", nil); event.Room != firstRoom {
		t.Fatalf("removed room = %q", event.Room)
	}

	// Chat and share changes come from the room's own conversation.
	remote := f.connectPipe()
	local := f.server.activeLocked().peer
	go f.server.forwardChat(firstRoom, local, local.Subscribe())

	if err := remote.Notify(peer.MethodShareChanged, peer.ShareChanged{}); err != nil {
		t.Fatal(err)
	}
	if event := until(t, live, "files.changed", nil); event.Room != firstRoom {
		t.Fatalf("files room = %q", event.Room)
	}

	if _, err := remote.SendChat(f.t.Context(), "hello", nil); err != nil {
		t.Fatal(err)
	}
	if event := until(t, live, "chat.message", nil); event.Room != firstRoom {
		t.Fatalf("chat room = %q", event.Room)
	}

	// An event about the whole computer names no room.
	f.server.hub.publish("settings.changed", nil)
	if event := until(t, live, "settings.changed", nil); event.Room != "" {
		t.Fatalf("global room = %q", event.Room)
	}
}
