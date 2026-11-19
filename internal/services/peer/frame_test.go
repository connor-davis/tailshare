package peer

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"testing/iotest"
)

func frameBytes(t *testing.T, value any) []byte {
	t.Helper()

	var out bytes.Buffer
	if err := (&frameWriter{writer: &out}).write(value); err != nil {
		t.Fatal(err)
	}

	return out.Bytes()
}

func TestFrameRoundTrip(t *testing.T) {
	data := frameBytes(t, map[string]string{"a": "<b>"})

	// The header is a 4-byte big-endian length of the JSON that follows.
	if size := binary.BigEndian.Uint32(data); int(size) != len(data)-4 {
		t.Fatalf("header says %d, body is %d", size, len(data)-4)
	}

	// Reading one byte at a time proves partial reads are stitched together.
	payload, err := readFrame(iotest.OneByteReader(bytes.NewReader(data)))
	if err != nil || string(payload) != `{"a":"<b>"}` {
		t.Fatalf("payload %q, err %v", payload, err)
	}
}

func TestFramesBackToBack(t *testing.T) {
	var stream bytes.Buffer
	writer := &frameWriter{writer: &stream}
	for _, word := range []string{"one", "two", "three"} {
		if err := writer.write(word); err != nil {
			t.Fatal(err)
		}
	}

	for _, want := range []string{`"one"`, `"two"`, `"three"`} {
		got, err := readFrame(&stream)
		if err != nil || string(got) != want {
			t.Fatalf("got %q, err %v, want %s", got, err, want)
		}
	}

	if _, err := readFrame(&stream); !errors.Is(err, io.EOF) {
		t.Fatalf("end of stream: %v", err)
	}
}

func TestFrameSizeLimits(t *testing.T) {
	var out bytes.Buffer
	writer := &frameWriter{writer: &out}

	// A string value costs two quote bytes, so this payload is exactly the cap.
	if err := writer.write(strings.Repeat("a", maxFrame-2)); err != nil {
		t.Fatalf("exact cap: %v", err)
	}
	if payload, err := readFrame(&out); err != nil || len(payload) != maxFrame {
		t.Fatalf("exact cap read: %d bytes, %v", len(payload), err)
	}

	if err := writer.write(strings.Repeat("a", maxFrame-1)); !errors.Is(err, errFrameSize) {
		t.Fatalf("one over the cap: %v", err)
	}
	if out.Len() != 0 {
		t.Fatal("an oversize frame was partly written")
	}

	// The reader refuses on the header alone, before it reads or allocates a body.
	header := binary.BigEndian.AppendUint32(nil, maxFrame+1)
	if _, err := readFrame(bytes.NewReader(header)); !errors.Is(err, errFrameSize) {
		t.Fatalf("oversize header: %v", err)
	}

	zero := binary.BigEndian.AppendUint32(nil, 0)
	if _, err := readFrame(bytes.NewReader(zero)); !errors.Is(err, errFrameSize) {
		t.Fatalf("zero length: %v", err)
	}
}

func TestFrameTruncated(t *testing.T) {
	data := frameBytes(t, "hello")

	if _, err := readFrame(bytes.NewReader(data[:2])); !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("cut header: %v", err)
	}
	if _, err := readFrame(bytes.NewReader(data[:len(data)-1])); !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("cut body: %v", err)
	}
}

// slowWriter writes in small pieces with a yield between them, so a missing
// lock would let two frames mix.
type slowWriter struct {
	mu  sync.Mutex
	out bytes.Buffer
}

func (slow *slowWriter) Write(data []byte) (int, error) {
	for start := 0; start < len(data); start += 3 {
		slow.mu.Lock()
		slow.out.Write(data[start:min(start+3, len(data))])
		slow.mu.Unlock()
	}

	return len(data), nil
}

func TestConcurrentFramesDoNotMix(t *testing.T) {
	slow := &slowWriter{}
	writer := &frameWriter{writer: slow}

	var group sync.WaitGroup
	for i := range 40 {
		group.Go(func() {
			if err := writer.write(map[string]any{"n": i, "pad": strings.Repeat("x", 50)}); err != nil {
				t.Error(err)
			}
		})
	}
	group.Wait()

	seen := map[float64]bool{}
	for range 40 {
		payload, err := readFrame(&slow.out)
		if err != nil {
			t.Fatal(err)
		}

		var value map[string]any
		if err := json.Unmarshal(payload, &value); err != nil {
			t.Fatalf("mixed frames: %v", err)
		}

		seen[value["n"].(float64)] = true
	}
	if len(seen) != 40 {
		t.Fatalf("got %d different frames, want 40", len(seen))
	}
}
