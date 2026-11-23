package tailshare

import (
	"encoding/json"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
)

// rosterMember is one seat the People tab shows. It never carries the member id, the
// address or the join order, so the screen can't leak them.
type rosterMember struct {
	DisplayName string `json:"displayName"`
	Fingerprint string `json:"fingerprint"`
	Host        bool   `json:"host"`
	You         bool   `json:"you"`
}

// rosterEvent is the roster JSON the screen reads.
type rosterEvent struct {
	Type    string         `json:"type"`
	Members []rosterMember `json:"members"`
}

// rosterStream remembers what NextRosterEvent sent last, so it reports real changes only.
type rosterStream struct {
	last string
}

// RoomCode is the share code of the room this phone joined, like 7K3Q9PXM, or empty
// when not connected. It lives in memory only; never log it or save it.
func (client *Client) RoomCode() string {
	client.mu.Lock()
	defer client.mu.Unlock()
	if client.session == nil {
		return ""
	}

	return client.code
}

// encodeRoster builds the roster JSON the same way the desktop marks its members.
func encodeRoster(joined *session.Session) string {
	selfID := joined.SelfID()
	members := []rosterMember{}
	for index, member := range joined.Members() {
		members = append(members, rosterMember{
			DisplayName: member.DisplayName,
			Fingerprint: peer.Fingerprint(member.ID),
			Host:        index == 0,
			You:         member.ID == selfID,
		})
	}

	body, _ := json.Marshal(rosterEvent{Type: "roster", Members: members})

	return string(body)
}

// NextRosterEvent blocks until the room's people change and returns them as JSON:
// {"type":"roster","members":[{"displayName","fingerprint","host","you"}]}. The first
// call returns the current roster at once; after that only a real change returns.
// {"type":"closed"} comes once when the room ends, then an error. Call it in a loop on
// a background thread. Leave makes a blocked call return.
func (client *Client) NextRosterEvent() (string, error) {
	for {
		client.mu.Lock()
		joined := client.session
		stream := client.roster
		ended := client.rosterEnded
		client.mu.Unlock()
		if joined == nil || ended {
			return "", errNoEvents
		}

		if stream == nil {
			stream = &rosterStream{}
			client.mu.Lock()
			client.roster = stream
			client.mu.Unlock()
		} else {
			// Changes also fires for paths and pending joins, so wait here and compare below.
			select {
			case <-joined.Changes():
			case <-joined.Done():
			}
		}

		// Leave clears the session first, so a left phone is closed even before Done.
		client.mu.Lock()
		left := client.session != joined
		client.mu.Unlock()
		select {
		case <-joined.Done():
			return closedRoster(client)
		default:
			if left {
				return closedRoster(client)
			}
		}

		current := encodeRoster(joined)
		client.mu.Lock()
		same := current == stream.last
		stream.last = current
		client.mu.Unlock()
		if !same {
			return current, nil
		}
	}
}

// closedRoster marks the roster stream finished and says so once.
func closedRoster(client *Client) (string, error) {
	client.mu.Lock()
	// After Leave there is no session and the next call errors anyway; a later
	// Join must start with a clean flag.
	client.rosterEnded = client.session != nil
	client.mu.Unlock()

	return `{"type":"closed"}`, nil
}
