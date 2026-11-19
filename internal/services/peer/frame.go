package peer

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"sync"
)

// maxFrame is the biggest payload one frame may carry. The length is checked
// before any memory is set aside, so a peer cannot make us allocate more.
const maxFrame = 1 << 20

var (
	errFrameSize  = errors.New("The other computer sent a message that was too large.")
	errFrameShape = errors.New("The other computer sent a message we could not read.")
)

// frameWriter sends one frame at a time. The lock keeps frames from two
// goroutines from being mixed together on the wire.
type frameWriter struct {
	mu     sync.Mutex
	writer io.Writer
}

// write sends the value as a frame: a 4-byte big-endian length, then JSON.
func (frames *frameWriter) write(value any) error {
	var body bytes.Buffer

	encoder := json.NewEncoder(&body)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return err
	}

	// Encode ends with a newline that is not part of the message.
	payload := bytes.TrimSuffix(body.Bytes(), []byte("\n"))
	if len(payload) == 0 || len(payload) > maxFrame {
		return errFrameSize
	}

	// One Write for header and body, so a partial frame is never sent first.
	frame := make([]byte, 4+len(payload))
	binary.BigEndian.PutUint32(frame, uint32(len(payload)))
	copy(frame[4:], payload)

	frames.mu.Lock()
	defer frames.mu.Unlock()

	_, err := frames.writer.Write(frame)

	return err
}

// readFrame reads one frame's payload. Zero length, oversize and cut-off
// frames are errors.
func readFrame(reader io.Reader) ([]byte, error) {
	var header [4]byte
	if _, err := io.ReadFull(reader, header[:]); err != nil {
		return nil, err
	}

	size := binary.BigEndian.Uint32(header[:])
	if size == 0 || size > maxFrame {
		return nil, errFrameSize
	}

	payload := make([]byte, size)
	if _, err := io.ReadFull(reader, payload); err != nil {
		if errors.Is(err, io.EOF) {
			err = io.ErrUnexpectedEOF
		}

		return nil, err
	}

	return payload, nil
}
