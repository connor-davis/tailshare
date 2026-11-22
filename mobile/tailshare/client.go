// Package tailshare is the small surface gomobile turns into the phone's Java
// library. It only joins a desktop room and lists the host's shared folder.
// gomobile can only pass simple types, so lists travel as JSON text.
package tailshare

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
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
		return err
	}
	client.session = joined

	return nil
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

// Leave closes the room on this phone. Calling it again is safe.
func (client *Client) Leave() error {
	client.mu.Lock()
	joined := client.session
	client.session = nil
	client.mu.Unlock()
	if joined == nil {
		return nil
	}

	return joined.Leave()
}
