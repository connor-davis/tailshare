// Package transfer moves files over separate session streams and keeps a local queue.
package transfer

import (
	"errors"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
)

// State describes a transfer's place in the queue.
type State string

const (
	// Queued waits for a free slot.
	Queued State = "queued"
	// Starting prepares a file and negotiates an offer.
	Starting State = "starting"
	// Running moves or verifies bytes.
	Running State = "running"
	// Paused keeps a partial for a later attempt.
	Paused State = "paused"
	// Failed keeps a partial after a recoverable error.
	Failed State = "failed"
	// Done means the receiver verified and published the file.
	Done State = "done"
	// Canceled means the unfinished file has been removed.
	Canceled State = "canceled"
)

// Transfer is an immutable queue snapshot.
type Transfer struct {
	ID        string         `json:"id"`
	Direction peer.Direction `json:"direction"`
	// Initiator is true when this computer started the transfer.
	Initiator bool   `json:"initiator"`
	Name      string `json:"name"`
	// LocalPath is relative to the shared folder, for local API path mapping only.
	LocalPath string `json:"-"`
	// PeerPath is the slash path on the other computer.
	PeerPath string `json:"peerPath"`
	// Size is the whole file size in bytes, at most 1 TiB.
	Size int64 `json:"size"`
	// Bytes is how many bytes have moved so far, including the resumed prefix.
	Bytes int64 `json:"bytes"`
	// Offset is the bytes already on disk when this attempt started. It is the resume point.
	Offset int64 `json:"offset"`
	State  State `json:"state"`
	// Reason is empty unless the transfer failed or was canceled. It is a plain sentence.
	Reason    string    `json:"reason"`
	UpdatedAt time.Time `json:"updatedAt"`
	// Speed is bytes per second for this attempt, averaged since it started.
	Speed float64 `json:"speed"`
}

// Event is a state change or throttled progress update.
type Event struct {
	// Kind says what changed. The only value in this package is "update".
	Kind string `json:"kind"`
	// Transfer is the new snapshot. It is the only field this package sets on Event.
	Transfer *Transfer `json:"transfer,omitempty"`
}

var (
	errDropped  = errors.New("The connection dropped. Resume to try again.")
	errChecksum = errors.New("The file did not match its checksum, so it was removed. Try again.")
	errInvalid  = errors.New("The transfer details are not valid.")
	errBusy     = errors.New("Two files are already transferring. Try again when one finishes.")
	errUnknown  = errors.New("That transfer is not available.")
)

// ErrUnavailable means the transfer is missing, ended, or cannot be controlled locally.
var ErrUnavailable = errUnknown

// ErrClosed means the manager can no longer start an attempt.
var ErrClosed = errDropped

func active(state State) bool { return state == Starting || state == Running }

func validID(id string) bool {
	if len(id) != 26 {
		return false
	}
	for _, character := range id {
		if !(character >= 'A' && character <= 'Z') && !(character >= '2' && character <= '7') {
			return false
		}
	}
	return true
}
