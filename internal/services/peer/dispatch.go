package peer

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/connor-davis/tailshare/internal/services/share"
)

// readLoop is the only reader of the stream. It never runs a slow handler
// itself, so one slow request cannot stop answers from arriving. Anything
// that breaks the protocol ends the conversation: after bad framing there is
// no safe way to find the next frame.
func (peer *Peer) readLoop() {
	defer peer.finish()

	for {
		payload, err := readFrame(peer.conn)
		if err != nil {
			return
		}

		var message envelope
		if err := json.Unmarshal(payload, &message); err != nil {
			return
		}
		if message.Version != envelopeVersion {
			return
		}

		switch message.Kind {
		case KindRequest:
			if !peer.dispatchRequest(message) {
				return
			}
		case KindResponse:
			if message.ID == "" || len(message.ID) > maxIDLength {
				return
			}

			peer.deliver(message)
		case KindEvent:
			peer.handleEvent(message)
		default:
			return
		}
	}
}

// dispatchRequest starts the handler for one request. It returns false when
// the request itself breaks the protocol.
func (peer *Peer) dispatchRequest(message envelope) bool {
	if message.ID == "" || len(message.ID) > maxIDLength || message.Method == "" {
		return false
	}

	select {
	case peer.inflight <- struct{}{}:
	default:
		return false
	}

	// Hello is worked out here so its effect is in place before the next frame.
	compute := func() (any, error) { return peer.serve(message) }
	if message.Method == MethodHello {
		result, err := peer.hello(message.Params)
		compute = func() (any, error) { return result, err }
	}

	// The answer is written from a goroutine: if both computers wrote from
	// their readers at once on an unbuffered stream, neither could read.
	go func() {
		defer func() { <-peer.inflight }()

		result, err := compute()
		peer.reply(message.ID, result, err)
	}()

	return true
}

func (peer *Peer) serve(message envelope) (any, error) {
	peer.mu.Lock()
	greeted := peer.greeted
	peer.mu.Unlock()

	if !greeted {
		return nil, &RemoteError{
			Code: CodeNotReady, Message: "The other computer has not said hello yet.",
		}
	}

	switch message.Method {
	case MethodList:
		return peer.handleList(message.Params)
	case MethodStat:
		return peer.handleStat(message.Params)
	case MethodChat:
		return peer.handleChat(message.Params)
	}

	if handler, ok := peer.options.Handlers[message.Method]; ok {
		return handler(context.WithValue(peer.ctx, conversationKey{}, peer), message.Params)
	}

	return nil, &RemoteError{
		Code: CodeUnknownMethod, Message: "This version of Tailshare cannot do that.",
	}
}

// reply answers one request. The result is never a raw Go error: the other
// computer sees a plain sentence and nothing about our files.
func (peer *Peer) reply(id string, result any, err error) {
	answer := envelope{Version: envelopeVersion, Kind: KindResponse, ID: id}

	if err != nil {
		answer.Error = remoteError(err)
	} else if raw, marshalErr := json.Marshal(result); marshalErr != nil {
		answer.Error = remoteError(marshalErr)
	} else {
		answer.Result = raw
	}

	err = peer.frames.write(answer)
	if errors.Is(err, errFrameSize) {
		answer.Result = nil
		answer.Error = &RemoteError{
			Code: CodeTooLarge, Message: "That answer is too large. Ask for fewer items at a time.",
		}
		err = peer.frames.write(answer)
	}
	if err != nil {
		_ = peer.Close()
	}
}

// remoteError maps a local error to what is safe to send.
func remoteError(err error) *RemoteError {
	if remote, ok := errors.AsType[*RemoteError](err); ok {
		return remote
	}

	codes := map[error]string{
		share.ErrBadPath:  CodeBadPath,
		share.ErrNotFound: CodeNotFound,
		share.ErrExists:   CodeExists,
		share.ErrDenied:   CodeDenied,
		share.ErrNotFile:  CodeBadRequest,
	}
	for known, code := range codes {
		if errors.Is(err, known) {
			return &RemoteError{Code: code, Message: known.Error()}
		}
	}

	return &RemoteError{Code: CodeInternal, Message: "Something went wrong on the other computer."}
}

// deliver hands a response to the call waiting for it. An answer nobody waits
// for, such as one that arrives after a cancel, is dropped.
func (peer *Peer) deliver(message envelope) {
	peer.mu.Lock()
	waiting := peer.pending[message.ID]
	peer.mu.Unlock()

	if waiting == nil {
		return
	}

	select {
	case waiting <- message:
	default:
	}
}

// handleEvent passes transfer and share events to subscribers. Other
// events are ignored so a newer build can send ones this build does not know.
func (peer *Peer) handleEvent(message envelope) {
	peer.mu.Lock()
	greeted := peer.greeted
	peer.mu.Unlock()
	if !greeted {
		return
	}

	if message.Method == MethodShareLeave || message.Method == MethodShareChanged {
		var payload map[string]json.RawMessage
		if len(message.Params) > MaxSharePayload || json.Unmarshal(message.Params, &payload) != nil ||
			payload == nil || len(payload) != 0 {
			return
		}

		peer.publish(Event{Kind: EventShare, Method: message.Method, Params: message.Params})
		return
	}

	if !strings.HasPrefix(message.Method, "transfer.") {
		return
	}

	peer.publish(Event{Kind: EventTransfer, Method: message.Method, Params: message.Params})
}

// finish runs once, when the reader stops: it wakes every waiting call and
// tells every subscriber the conversation is over.
func (peer *Peer) finish() {
	peer.cancel()
	_ = peer.conn.Close()

	peer.mu.Lock()
	peer.closed = true
	peer.publishLocked(Event{Kind: EventClosed})
	for subscription := range peer.subscribers {
		close(subscription.ch)
	}
	clear(peer.subscribers)
	peer.mu.Unlock()

	close(peer.done)
}
