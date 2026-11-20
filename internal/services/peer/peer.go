// Package peer is the conversation between two joined computers. It speaks
// length-prefixed JSON frames over one long-lived stream from the session:
// either side can ask, answer or announce. It knows nothing about HTTP,
// WebSockets or the screen; the local API turns its typed methods and events
// into those.
package peer

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"strconv"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/Polyphron-AI/tailshare/internal/services/share"
)

const (
	maxDisplayName = 64
	maxFolderName  = 255
	maxIDLength    = 64

	// An honest peer needs a handful of requests at once. A peer that holds
	// more than this open is treated as broken, and the connection closes.
	maxInflight = 32
	maxPending  = 64
)

var (
	errClosed  = errors.New("The connection to the other computer has closed.")
	errBusy    = errors.New("Too many requests are waiting. Try again in a moment.")
	errBadName = errors.New("The other computer sent an invalid name.")
	errVersion = errors.New("The other computer uses a different version of Tailshare.")
)

// Handler answers one request from the other computer. Return a *RemoteError
// to choose the code and message the other side sees; any other error becomes
// a generic message, so no local detail leaks.
type Handler func(ctx context.Context, params json.RawMessage) (any, error)

// Options set up one side of the conversation.
type Options struct {
	// DisplayName is how this computer introduces itself. It is required.
	DisplayName string

	// Share is the folder offered to the other computer. Nil means none.
	// The caller owns it and closes it when the session ends.
	Share *share.Root

	// Handlers answer extra requests, such as the transfer controls.
	// They cannot replace the built-in methods.
	Handlers map[string]Handler
}

// Remote is what the other computer said about itself in hello.
type Remote struct {
	// DisplayName is at most 64 characters.
	DisplayName string `json:"displayName"`
	// SharedFolderName is at most 255 characters.
	SharedFolderName string `json:"sharedFolderName"`
	// Version is the protocol version both sides agreed in hello.
	Version int `json:"version"`
}

// Peer is one side of an open conversation. It is safe for concurrent use.
type Peer struct {
	conn     net.Conn
	frames   *frameWriter
	options  Options
	ctx      context.Context
	cancel   context.CancelFunc
	done     chan struct{}
	inflight chan struct{}

	mu          sync.Mutex
	nextID      int64
	pending     map[string]chan envelope
	greeted     bool
	remote      Remote
	closed      bool
	seq         int64
	history     []ChatMessage
	subscribers map[*Subscription]struct{}
}

// Start takes over the stream, says hello and waits for the other side's hello
// reply. Both computers must call it. It owns conn from here on and closes it
// on failure. The context bounds the hello and, when it ends, closes the peer.
func Start(ctx context.Context, conn net.Conn, options Options) (*Peer, error) {
	name, err := cleanName(options.DisplayName, maxDisplayName, false)
	if err != nil {
		_ = conn.Close()
		return nil, errors.New("This computer needs a name before it can connect.")
	}

	options.DisplayName = name

	lifetime, cancel := context.WithCancel(context.Background())
	peer := &Peer{
		conn:        conn,
		frames:      &frameWriter{writer: conn},
		options:     options,
		ctx:         lifetime,
		cancel:      cancel,
		done:        make(chan struct{}),
		inflight:    make(chan struct{}, maxInflight),
		pending:     make(map[string]chan envelope),
		subscribers: make(map[*Subscription]struct{}),
	}

	go peer.readLoop()

	stop := context.AfterFunc(ctx, func() { _ = peer.Close() })
	defer stop()

	hello := helloParams{
		Versions: supportedVersions, DisplayName: name, SharedFolderName: peer.folderName(),
	}

	var reply helloResult
	if err := peer.Call(ctx, MethodHello, hello, &reply); err != nil {
		_ = peer.Close()
		return nil, err
	}

	remote, err := checkHello(reply)
	if err != nil {
		_ = peer.Close()
		return nil, err
	}

	peer.mu.Lock()
	peer.remote = remote
	peer.mu.Unlock()

	return peer, nil
}

// Remote returns what the other computer said about itself.
func (peer *Peer) Remote() Remote {
	peer.mu.Lock()
	defer peer.mu.Unlock()

	return peer.remote
}

// Done is closed once the conversation has ended, for any reason.
func (peer *Peer) Done() <-chan struct{} {
	return peer.done
}

// Close ends the conversation and closes the stream. It is safe to call more
// than once. It does not close the shared folder.
func (peer *Peer) Close() error {
	peer.cancel()
	err := peer.conn.Close()
	<-peer.done

	if errors.Is(err, net.ErrClosed) {
		return nil
	}

	return err
}

// Call sends a request and waits for its answer, decoding the result into
// result (nil to ignore it). A *RemoteError means the other side said no.
// The transfer manager uses it for the transfer controls.
func (peer *Peer) Call(ctx context.Context, method string, params, result any) error {
	raw, err := marshalOptional(params)
	if err != nil {
		return errors.New("Could not prepare the request.")
	}

	peer.mu.Lock()
	if peer.closed {
		peer.mu.Unlock()
		return errClosed
	}
	if len(peer.pending) >= maxPending {
		peer.mu.Unlock()
		return errBusy
	}

	peer.nextID++
	id := strconv.FormatInt(peer.nextID, 10)
	answer := make(chan envelope, 1)
	peer.pending[id] = answer
	peer.mu.Unlock()

	// A request that is canceled or answered late must not leave an entry behind.
	defer func() {
		peer.mu.Lock()
		delete(peer.pending, id)
		peer.mu.Unlock()
	}()

	request := envelope{
		Version: envelopeVersion, Kind: KindRequest, ID: id, Method: method, Params: raw,
	}
	if err := peer.frames.write(request); err != nil {
		if errors.Is(err, errFrameSize) {
			return err
		}

		_ = peer.Close()

		return errClosed
	}

	select {
	case reply := <-answer:
		if reply.Error != nil {
			return reply.Error
		}
		if result == nil || len(reply.Result) == 0 {
			return nil
		}
		if err := json.Unmarshal(reply.Result, result); err != nil {
			return errFrameShape
		}

		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-peer.done:
		return errClosed
	}
}

// Notify sends an event. Nothing answers it. Transfers use it for receiver verdicts and cancellation.
func (peer *Peer) Notify(method string, params any) error {
	raw, err := marshalOptional(params)
	if err != nil {
		return errors.New("Could not prepare the message.")
	}

	select {
	case <-peer.done:
		return errClosed
	default:
	}

	return peer.frames.write(envelope{
		Version: envelopeVersion, Kind: KindEvent, Method: method, Params: raw,
	})
}

func (peer *Peer) folderName() string {
	if peer.options.Share == nil {
		return ""
	}

	return peer.options.Share.Name()
}

// hello answers the other side's hello. It runs in the reader, before the next
// frame is read, so no later request can slip in ahead of it.
func (peer *Peer) hello(raw json.RawMessage) (any, error) {
	var in helloParams
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil, badRequest()
	}

	if _, err := cleanName(in.DisplayName, maxDisplayName, false); err != nil {
		return nil, &RemoteError{Code: CodeBadRequest, Message: errBadName.Error()}
	}
	if _, err := cleanName(in.SharedFolderName, maxFolderName, true); err != nil {
		return nil, &RemoteError{Code: CodeBadRequest, Message: errBadName.Error()}
	}

	version := 0
	for _, offered := range in.Versions {
		for _, ours := range supportedVersions {
			if offered == ours {
				version = max(version, offered)
			}
		}
	}
	if version == 0 {
		return nil, &RemoteError{Code: CodeUnsupportedVersion, Message: errVersion.Error()}
	}

	peer.mu.Lock()
	defer peer.mu.Unlock()

	// A second hello could swap the other computer's identity mid-session.
	if peer.greeted {
		return nil, badRequest()
	}

	peer.greeted = true

	return helloResult{
		Version: version, DisplayName: peer.options.DisplayName, SharedFolderName: peer.folderName(),
	}, nil
}

// checkHello validates the other side's reply to our hello.
func checkHello(reply helloResult) (Remote, error) {
	known := false
	for _, version := range supportedVersions {
		known = known || version == reply.Version
	}
	if !known {
		return Remote{}, &RemoteError{Code: CodeUnsupportedVersion, Message: errVersion.Error()}
	}

	name, err := cleanName(reply.DisplayName, maxDisplayName, false)
	if err != nil {
		return Remote{}, errBadName
	}

	folder, err := cleanName(reply.SharedFolderName, maxFolderName, true)
	if err != nil {
		return Remote{}, errBadName
	}

	return Remote{DisplayName: name, SharedFolderName: folder, Version: reply.Version}, nil
}

// cleanName checks a name from the other computer. It is for display only and
// is never used as a path.
func cleanName(name string, limit int, allowEmpty bool) (string, error) {
	name = strings.TrimSpace(name)

	switch {
	case name == "" && !allowEmpty:
		return "", errBadName
	case !utf8.ValidString(name) || utf8.RuneCountInString(name) > limit:
		return "", errBadName
	case strings.IndexFunc(name, unicode.IsControl) >= 0:
		return "", errBadName
	}

	return name, nil
}

func marshalOptional(value any) (json.RawMessage, error) {
	if value == nil {
		return nil, nil
	}

	return json.Marshal(value)
}

func badRequest() *RemoteError {
	return &RemoteError{Code: CodeBadRequest, Message: "The request could not be understood."}
}
