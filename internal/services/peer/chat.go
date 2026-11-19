package peer

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	maxChatText = 8 << 10
	maxHistory  = 200

	// A screen that falls this far behind is cut off and asks for a fresh
	// snapshot, rather than making the reader wait for it.
	subscriberBuffer = 64
)

// EventKind says what an Event is.
type EventKind string

// The kinds of Event.
const (
	// EventChat is a chat message, sent or received.
	EventChat EventKind = "chat"
	// EventTransfer is a transfer.* event from the other computer.
	EventTransfer EventKind = "transfer"
	// EventClosed means the conversation has ended. It is the last event.
	EventClosed EventKind = "closed"
)

// ChatMessage is one line of chat. Chat lives in memory only: it is never
// written to disk and never logged.
type ChatMessage struct {
	// Seq counts the lines this computer has recorded. It is not the other side's count.
	Seq int64 `json:"seq"`
	// ID is random text from the sender, at most 64 characters with no control characters.
	ID       string `json:"id"`
	FromPeer bool   `json:"fromPeer"`
	// Text is at most 8 KiB of valid UTF-8.
	Text string    `json:"text"`
	Time time.Time `json:"time"`
}

// Event is something the screen should hear about. Seq grows by one for every
// event of any kind.
type Event struct {
	Seq  int64     `json:"seq"`
	Kind EventKind `json:"kind"`
	// Chat is set only when Kind is chat.
	Chat *ChatMessage `json:"chat,omitempty"`
	// Method is set only for transfer events, such as transfer.offer.
	Method string `json:"method,omitempty"`
	// Params is the raw JSON for Method. Set only for transfer events.
	Params json.RawMessage `json:"params,omitempty"`
}

// Subscription is a view of the conversation with no gap: Snapshot holds the
// chat so far and Events everything after it, so nothing is missed or shown
// twice. If the reader falls too far behind, Events is closed early; subscribe
// again to start from a fresh snapshot.
type Subscription struct {
	Snapshot []ChatMessage
	Events   <-chan Event

	peer *Peer
	ch   chan Event
}

// Close stops the subscription.
func (subscription *Subscription) Close() {
	subscription.peer.mu.Lock()
	defer subscription.peer.mu.Unlock()

	if _, live := subscription.peer.subscribers[subscription]; live {
		delete(subscription.peer.subscribers, subscription)
		close(subscription.ch)
	}
}

// Subscribe returns the chat history and then every later event.
func (peer *Peer) Subscribe() *Subscription {
	peer.mu.Lock()
	defer peer.mu.Unlock()

	events := make(chan Event, subscriberBuffer)
	subscription := &Subscription{
		Snapshot: append([]ChatMessage(nil), peer.history...),
		Events:   events,
		peer:     peer,
		ch:       events,
	}

	if peer.closed {
		close(events)

		return subscription
	}

	peer.subscribers[subscription] = struct{}{}

	return subscription
}

// SendChat sends one chat message and, once the other computer has taken it,
// adds it to this side's history.
func (peer *Peer) SendChat(ctx context.Context, text string) (ChatMessage, error) {
	if err := checkChatText(text); err != nil {
		return ChatMessage{}, err
	}

	id := rand.Text()
	now := time.Now().UTC()
	params := chatParams{ID: id, Text: text, SentAt: now}
	if err := peer.Call(ctx, MethodChat, params, nil); err != nil {
		return ChatMessage{}, err
	}

	return peer.record(ChatMessage{ID: id, Text: text, Time: now}), nil
}

func (peer *Peer) handleChat(raw json.RawMessage) (any, error) {
	var params chatParams
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, badRequest()
	}

	badID := params.ID == "" || len(params.ID) > maxIDLength ||
		strings.IndexFunc(params.ID, unicode.IsControl) >= 0
	if badID {
		return nil, badRequest()
	}
	if err := checkChatText(params.Text); err != nil {
		return nil, &RemoteError{Code: CodeBadRequest, Message: err.Error()}
	}

	// The receiver's own clock, not the sender's, so the log stays in order.
	peer.record(ChatMessage{ID: params.ID, FromPeer: true, Text: params.Text, Time: time.Now().UTC()})

	return struct{}{}, nil
}

// checkChatText allows new lines and tabs but no other control characters.
func checkChatText(text string) error {
	switch {
	case strings.TrimSpace(text) == "":
		return errors.New("Type a message first.")
	case len(text) > maxChatText:
		return errors.New("That message is too long. Keep it under 8 KB.")
	case !utf8.ValidString(text):
		return errors.New("That message has characters that cannot be sent.")
	}

	for _, char := range text {
		if unicode.IsControl(char) && char != '\n' && char != '\r' && char != '\t' {
			return errors.New("That message has characters that cannot be sent.")
		}
	}

	return nil
}

// record keeps a message in the capped history and announces it.
func (peer *Peer) record(message ChatMessage) ChatMessage {
	peer.mu.Lock()
	defer peer.mu.Unlock()

	peer.seq++
	message.Seq = peer.seq

	if len(peer.history) == maxHistory {
		copy(peer.history, peer.history[1:])
		peer.history = peer.history[:maxHistory-1]
	}

	peer.history = append(peer.history, message)
	peer.deliverLocked(Event{Seq: message.Seq, Kind: EventChat, Chat: &message})

	return message
}

// publish announces an event that needs no history.
func (peer *Peer) publish(event Event) {
	peer.mu.Lock()
	defer peer.mu.Unlock()

	peer.publishLocked(event)
}

func (peer *Peer) publishLocked(event Event) {
	peer.seq++
	event.Seq = peer.seq
	peer.deliverLocked(event)
}

func (peer *Peer) deliverLocked(event Event) {
	for subscription := range peer.subscribers {
		select {
		case subscription.ch <- event:
		default:
			delete(peer.subscribers, subscription)
			close(subscription.ch)
		}
	}
}
