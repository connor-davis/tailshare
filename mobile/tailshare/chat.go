package tailshare

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
)

// chatTimeout bounds one chat message over the tunnel, the same as the desktop.
const chatTimeout = 30 * time.Second

// chatEvent is the message JSON the screen reads. Chat stays in memory only.
type chatEvent struct {
	Type     string `json:"type"`
	ID       string `json:"id"`
	From     string `json:"from"`
	FromName string `json:"fromName"`
	Text     string `json:"text"`
	SentAt   string `json:"sentAt"`
	Mine     bool   `json:"mine"`
	// History marks snapshot replay so native notifications only show live messages.
	History  bool   `json:"history"`
	FileName string `json:"fileName,omitempty"`
}

// chatStream is the one chat subscription NextChatEvent reads.
type chatStream struct {
	subscription *peer.Subscription
	// pending holds the history being replayed one message per call.
	pending []peer.ChatMessage
}

// hostControl is the conversation with the host, the first member of the roster.
func hostControl(joined *session.Session) (*peer.Peer, peer.ShareMember, error) {
	members := joined.Members()
	if len(members) == 0 {
		return nil, peer.ShareMember{}, errors.New("The room has closed.")
	}

	control, ok := joined.Control(members[0].ID)
	if !ok {
		return nil, peer.ShareMember{}, errors.New("The host is not reachable.")
	}

	return control, members[0], nil
}

// SendChat sends one text message to the host. The text rules are the desktop's:
// not empty and under 8 KB. It blocks, so call it off the main thread.
func (client *Client) SendChat(text string) error {
	client.mu.Lock()
	joined := client.session
	client.mu.Unlock()
	if joined == nil {
		return errNotJoined
	}

	control, _, err := hostControl(joined)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), chatTimeout)
	defer cancel()

	_, err = control.SendChat(ctx, text)

	return err
}

// NextChatEvent blocks until there is a chat message to show and returns it as JSON:
// {"type":"chat","id","from","fromName","text","sentAt","mine","fileName"?}. The first
// calls replay the history, one message each, with history:true; live messages have history:false.
// {"type":"closed"} comes once when the room ends, then an error. After a re-subscribe
// the history replays again, so the screen must ignore ids it already has. Leave makes a
// blocked call return.
func (client *Client) NextChatEvent() (string, error) {
	for {
		client.mu.Lock()
		joined := client.session
		stream := client.chat
		ended := client.chatEnded
		client.mu.Unlock()
		if joined == nil || ended {
			return "", errNoEvents
		}

		if stream == nil {
			control, _, err := hostControl(joined)
			if err != nil {
				return closedChat(client)
			}

			subscription := control.Subscribe()
			stream = &chatStream{subscription: subscription, pending: subscription.Snapshot}
			client.mu.Lock()
			client.chat = stream
			client.mu.Unlock()
		}

		client.mu.Lock()
		if len(stream.pending) > 0 {
			next := stream.pending[0]
			stream.pending = stream.pending[1:]
			client.mu.Unlock()

			return client.encodeChat(joined, next, true), nil
		}
		client.mu.Unlock()

		for event := range stream.subscription.Events {
			if event.Kind == peer.EventChat && event.Chat != nil {
				return client.encodeChat(joined, *event.Chat, false), nil
			}
		}

		// The channel closes when the conversation ends or this reader fell too far behind.
		stream.subscription.Close()
		client.mu.Lock()
		left := client.session != joined
		client.chat = nil
		client.mu.Unlock()

		select {
		case <-joined.Done():
			return closedChat(client)
		default:
			if left {
				return closedChat(client)
			}
		}

		// Still open: loop to subscribe again.
	}
}

// encodeChat turns one message into the screen's JSON.
func (client *Client) encodeChat(joined *session.Session, message peer.ChatMessage, history bool) string {
	event := chatEvent{
		Type:    "chat",
		History: history,
		ID:      message.ID,
		Text:    message.Text,
		SentAt:  message.Time.Format(time.RFC3339),
		Mine:    !message.FromPeer,
	}
	if message.Attachment != nil {
		event.FileName = message.Attachment.Name
	}

	if event.Mine {
		event.From, event.FromName = joined.SelfID(), client.name
	} else if members := joined.Members(); len(members) > 0 {
		event.From, event.FromName = members[0].ID, members[0].DisplayName
	}

	body, _ := json.Marshal(event)

	return string(body)
}

// closedChat marks the chat stream finished and says so once.
func closedChat(client *Client) (string, error) {
	client.mu.Lock()
	// After Leave there is no session and the next call errors anyway; a later
	// Join must start with a clean flag.
	client.chatEnded = client.session != nil
	client.mu.Unlock()

	return `{"type":"closed"}`, nil
}
