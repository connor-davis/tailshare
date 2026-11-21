package peer

// MethodStreamOpen asks the receiver to open a data stream back to the sender.
// Only the member that dialed a link can open streams on it, so the member that
// did not dial uses this to ask for one.
const MethodStreamOpen = "stream.open"

// MaxStreamHeader is the longest header a session stream carries, in bytes.
const MaxStreamHeader = 64

// StreamOpen is the body of MethodStreamOpen.
type StreamOpen struct {
	// Kind is the stream kind byte the receiver serves, 1 to 255.
	Kind int `json:"kind"`
	// Header is the kind's own bytes, at most MaxStreamHeader.
	Header []byte `json:"header"`
	// Nonce is 16 random bytes. The receiver sends it as the header of the
	// stream it opens back, so the sender can match that stream to this call.
	Nonce []byte `json:"nonce"`
}
