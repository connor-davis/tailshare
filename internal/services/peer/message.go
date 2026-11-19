package peer

import (
	"encoding/json"
	"time"
)

// envelopeVersion is the version of the envelope shape. The protocol version
// the two sides speak is agreed separately in hello.
const envelopeVersion = 1

// supportedVersions are the protocol versions this build speaks, highest last.
var supportedVersions = []int{1}

// Kind says what an envelope is.
type Kind string

// The three envelope kinds.
const (
	// KindRequest asks the other side to do something and answer.
	KindRequest Kind = "request"
	// KindResponse answers one request. It echoes the request's ID.
	KindResponse Kind = "response"
	// KindEvent tells the other side something. It has no answer.
	KindEvent Kind = "event"
)

// Method names a request or event.
const (
	// MethodHello opens the conversation: versions and display names.
	MethodHello = "hello"
	// MethodList lists one page of a folder.
	MethodList = "list"
	// MethodStat describes one file or folder.
	MethodStat = "stat"
	// MethodChat delivers one chat message.
	MethodChat = "chat"
	// MethodTransferOffer offers a file in one direction (step 5).
	MethodTransferOffer = "transfer.offer"
	// MethodTransferAccept answers an offer (step 5).
	MethodTransferAccept = "transfer.accept"
	// MethodTransferCancel stops a transfer (step 5).
	MethodTransferCancel = "transfer.cancel"
	// MethodTransferResume asks to continue from an offset (step 5).
	MethodTransferResume = "transfer.resume"
	// MethodTransferProgress reports bytes moved (step 5 event).
	MethodTransferProgress = "transfer.progress"
	// MethodTransferComplete reports a finished transfer (step 5 event).
	MethodTransferComplete = "transfer.complete"
	// MethodTransferFailed reports a transfer that stopped early (step 5 event).
	MethodTransferFailed = "transfer.failed"
)

// Error codes a response can carry. The message is always a plain sentence.
const (
	// CodeBadRequest means the request was not valid.
	CodeBadRequest = "bad_request"
	// CodeUnknownMethod means this build does not know the method.
	CodeUnknownMethod = "unknown_method"
	// CodeNotReady means hello has not happened yet.
	CodeNotReady = "not_ready"
	// CodeNotSharing means this side shares no folder.
	CodeNotSharing = "not_sharing"
	// CodeUnsupportedVersion means the two builds share no protocol version.
	CodeUnsupportedVersion = "unsupported_version"
	// CodeTooLarge means the answer would not fit in one frame.
	CodeTooLarge = "too_large"
	// CodeBadPath means the path is not allowed.
	CodeBadPath = "bad_path"
	// CodeNotFound means nothing is at the path.
	CodeNotFound = "not_found"
	// CodeExists means the name is taken.
	CodeExists = "exists"
	// CodeDenied means the path is not available.
	CodeDenied = "denied"
	// CodeInternal means something went wrong that the user did not cause.
	CodeInternal = "internal"
)

// RemoteError is an error the other computer sent back. Message is safe to
// show on screen.
type RemoteError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error returns the plain sentence.
func (remote *RemoteError) Error() string {
	return remote.Message
}

// envelope is the one shape of every frame.
type envelope struct {
	Version int             `json:"version"`
	Kind    Kind            `json:"kind"`
	ID      string          `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RemoteError    `json:"error,omitempty"`
}

type helloParams struct {
	Versions         []int  `json:"versions"`
	DisplayName      string `json:"displayName"`
	SharedFolderName string `json:"sharedFolderName"`
}

type helloResult struct {
	Version          int    `json:"version"`
	DisplayName      string `json:"displayName"`
	SharedFolderName string `json:"sharedFolderName"`
}

type listParams struct {
	Dir    string `json:"dir"`
	Offset int    `json:"offset"`
	Limit  int    `json:"limit"`
}

// ListResult is one page of a folder. Total counts every entry, so the screen
// knows whether to ask for more.
type ListResult struct {
	Entries []Entry `json:"entries"`
	Total   int     `json:"total"`
}

type statParams struct {
	Path string `json:"path"`
}

// chatParams is the chat wire shape. SentAt is for the sender's records only:
// the receiver stamps its own clock, so a wrong clock cannot reorder the log.
type chatParams struct {
	ID     string    `json:"id"`
	Text   string    `json:"text"`
	SentAt time.Time `json:"sentAt"`
}

// Direction is which way a file travels, from the offering side's view.
type Direction string

// The two directions.
const (
	// DirectionDownload means the offering side asks to receive the file.
	DirectionDownload Direction = "download"
	// DirectionUpload means the offering side sends the file.
	DirectionUpload Direction = "upload"
)

// TransferOffer is the payload of transfer.offer. Step 5 sends and answers it.
type TransferOffer struct {
	TransferID string    `json:"transferID"`
	Path       string    `json:"path"`
	Direction  Direction `json:"direction"`
	Size       int64     `json:"size"`
	SHA256     string    `json:"sha256"`
}

// TransferAccept is the payload of transfer.accept.
type TransferAccept struct {
	TransferID string `json:"transferID"`
	Accepted   bool   `json:"accepted"`
	Reason     string `json:"reason,omitempty"`
}

// TransferCancel is the payload of transfer.cancel.
type TransferCancel struct {
	TransferID string `json:"transferID"`
	Reason     string `json:"reason,omitempty"`
}

// TransferResume is the payload of transfer.resume.
type TransferResume struct {
	TransferID string `json:"transferID"`
	Offset     int64  `json:"offset"`
	SHA256     string `json:"sha256"`
}

// TransferProgress is the payload of the transfer.progress event.
type TransferProgress struct {
	TransferID string `json:"transferID"`
	Bytes      int64  `json:"bytes"`
}

// TransferComplete is the payload of the transfer.complete event.
type TransferComplete struct {
	TransferID string `json:"transferID"`
}

// TransferFailed is the payload of the transfer.failed event.
type TransferFailed struct {
	TransferID string `json:"transferID"`
	Reason     string `json:"reason"`
}
