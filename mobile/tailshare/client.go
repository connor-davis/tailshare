// Package tailshare is the small surface gomobile turns into the phone's Java
// library. It only joins a desktop room and lists the host's shared folder.
// gomobile can only pass simple types, so lists travel as JSON text.
package tailshare

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/services/share"
	"tailscale.com/tailcfg"
)

// freeRegion is the Tailcat relay the phone prefers (Frankfurt). Joining still
// finds the host across all four free relays.
const freeRegion = 303

// listTimeout bounds one folder request over the tunnel.
const listTimeout = 20 * time.Second

// Client is one phone's link to one desktop room.
type Client struct {
	mu      sync.Mutex
	name    string
	mapURL  string
	region  int
	cancel  context.CancelFunc
	session *session.Session
	// events is the one subscription NextEvent reads; nil until the first call.
	events *peer.Subscription
	// eventsEnded is set once NextEvent has reported the room closed.
	eventsEnded bool
	// transfers is nil until EnableTransfers.
	transfers *transfers
}

// NewClient makes a client that shows name to the host. An empty relayMapURL
// means Tailcat's free relays; relayRegion 0 means the default region. Both
// only differ from the defaults for a self-hosted relay and for tests.
func NewClient(name, relayMapURL string, relayRegion int) *Client {
	if relayRegion == 0 {
		relayRegion = freeRegion
	}

	return &Client{name: name, mapURL: relayMapURL, region: relayRegion}
}

// errCancelled is what Join returns after Cancel, and only then.
var errCancelled = errors.New("Joining was cancelled.")

// Join connects by share code and waits for the host to approve on the desktop.
// It blocks, so call it off the main thread. Cancel stops the wait.
func (client *Client) Join(code string) error {
	ctx, cancel := context.WithCancel(context.Background())

	client.mu.Lock()
	if client.session != nil || client.cancel != nil {
		client.mu.Unlock()
		cancel()
		return errors.New("This phone is already connected.")
	}
	client.cancel = cancel
	client.mu.Unlock()

	// The phone has no saved identity yet, so every join is a stranger the host
	// must approve (a random key per join).
	cfg := config.Config{DERPMapURL: client.mapURL, Region: tailcfg.DERPRegionID(client.region)}

	joined, err := session.Join(ctx, code, cfg, client.name, session.Options{})

	// Read this before cancel() below, or every failure would look like Cancel.
	cancelled := ctx.Err() != nil

	client.mu.Lock()
	defer client.mu.Unlock()
	client.cancel = nil
	cancel()
	if err != nil {
		if cancelled {
			return errCancelled
		}
		return withDetails(err)
	}
	client.session = joined

	return nil
}

// withDetails puts the hidden cause under the screen text, so a tester can tell which
// join step failed. The desktop never shows it.
func withDetails(err error) error {
	var step *session.StepError
	if errors.As(err, &step) && step.Cause != nil {
		return fmt.Errorf("%s\n\nDetails: %v", step.Text, step.Cause)
	}

	var remote *peer.RemoteError
	if errors.As(err, &remote) {
		return fmt.Errorf("%s\n\nDetails: the other computer answered %q.", err.Error(), remote.Code)
	}

	return err
}

// Cancel stops a Join that is still waiting. It does nothing otherwise.
func (client *Client) Cancel() {
	client.mu.Lock()
	defer client.mu.Unlock()
	if client.cancel != nil {
		client.cancel()
	}
}

// RoomName is the host's name for the room, or empty when not connected.
func (client *Client) RoomName() string {
	client.mu.Lock()
	defer client.mu.Unlock()
	if client.session == nil {
		return ""
	}

	return client.session.RoomName()
}

// Connected says whether the room is still open. A host that leaves ends it.
func (client *Client) Connected() bool {
	client.mu.Lock()
	defer client.mu.Unlock()
	if client.session == nil {
		return false
	}
	select {
	case <-client.session.Done():
		return false
	default:
		return true
	}
}

// ListRemote returns one folder of the host's shared folder as JSON:
// {"entries":[{"name","size","modTime","isDir"}],"total":n}. An empty dir is
// the shared folder itself.
func (client *Client) ListRemote(dir string) (string, error) {
	// The host checks the path too; refusing a bad one here saves a round trip.
	if _, err := share.Localize(dir); err != nil {
		return "", err
	}

	client.mu.Lock()
	joined := client.session
	client.mu.Unlock()
	if joined == nil {
		return "", errors.New("This phone is not connected.")
	}

	members := joined.Members()
	if len(members) == 0 {
		return "", errors.New("The room has closed.")
	}

	// The host is first in the roster.
	control, ok := joined.Control(members[0].ID)
	if !ok {
		return "", errors.New("The host is not reachable.")
	}

	ctx, cancel := context.WithTimeout(context.Background(), listTimeout)
	defer cancel()

	result, err := control.List(ctx, dir, 0, 0)
	if err != nil {
		return "", err
	}
	body, err := json.Marshal(result)
	if err != nil {
		return "", errors.New("The list could not be read.")
	}

	return string(body), nil
}

// errNoEvents is what NextEvent returns once the room has closed, so the
// caller's loop ends.
var errNoEvents = errors.New("The room has closed.")

// NextEvent blocks until the host says something the screen should show, and
// returns it as JSON: {"type":"files.changed"} when the host's shared folder
// changed, or {"type":"closed"} once, when the room ends. After that it
// returns an error. Call it in a loop on a background thread. The first call
// and every re-subscribe report files.changed, because events may have been
// missed in between. Leave makes a blocked call return.
func (client *Client) NextEvent() (string, error) {
	client.mu.Lock()
	joined := client.session
	subscription := client.events
	ended := client.eventsEnded
	client.mu.Unlock()
	if joined == nil || ended {
		return "", errNoEvents
	}

	if subscription == nil {
		members := joined.Members()
		if len(members) == 0 {
			return closedEvent(client)
		}

		// The host is first in the roster.
		control, ok := joined.Control(members[0].ID)
		if !ok {
			return closedEvent(client)
		}

		subscription = control.Subscribe()
		client.mu.Lock()
		client.events = subscription
		client.mu.Unlock()

		return `{"type":"files.changed"}`, nil
	}

	for event := range subscription.Events {
		if event.Kind == peer.EventShare && event.Method == peer.MethodShareChanged {
			return `{"type":"files.changed"}`, nil
		}
	}

	// The channel closes when the conversation ends or this reader fell more than 64 events behind.
	subscription.Close()
	client.mu.Lock()
	left := client.session != joined
	client.events = nil
	client.mu.Unlock()

	// Leave clears the session first, so a left phone is closed even before Done.
	select {
	case <-joined.Done():
		return closedEvent(client)
	default:
		if left {
			return closedEvent(client)
		}
	}

	// Still open: the next call subscribes again and reports files.changed.
	return client.NextEvent()
}

// closedEvent marks the event stream finished and says so once.
func closedEvent(client *Client) (string, error) {
	client.mu.Lock()
	// After Leave there is no session and the next call errors anyway; a later
	// Join must start with a clean flag.
	client.eventsEnded = client.session != nil
	client.mu.Unlock()

	return `{"type":"closed"}`, nil
}

// Leave closes the room on this phone. Calling it again is safe.
func (client *Client) Leave() error {
	client.mu.Lock()
	joined := client.session
	client.session = nil
	events := client.events
	client.events, client.eventsEnded = nil, false
	client.mu.Unlock()
	if joined == nil {
		return nil
	}
	if events != nil {
		events.Close()
	}
	client.closeTransfers()

	return joined.Leave()
}
