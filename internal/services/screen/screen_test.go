package screen

import (
	"bytes"
	"encoding/binary"
	"net"
	"testing"
	"time"
)

func TestFrameBounds(t *testing.T) {
	for _, length := range []uint32{0, 1, MaxChunk + 1} {
		var header [4]byte
		binary.BigEndian.PutUint32(header[:], length)

		if _, err := ReadChunk(bytes.NewReader(header[:])); err == nil {
			t.Fatal("bad frame accepted")
		}
	}
}

func TestEpochAndSlowViewerBounds(t *testing.T) {
	screens := New(nil)
	defer screens.Close()
	screens.local = listing{Share: &recording{ID: "0123456789abcdef"}}
	sender, receiver := net.Pipe()
	defer receiver.Close()
	screens.viewers["slow"] = &viewer{conn: sender, queue: make(chan []byte, 1)}

	if err := screens.Push(screens.local.Share.ID, []byte{0, 1}); err == nil {
		t.Fatal("missing init accepted")
	}

	if err := screens.Push(screens.local.Share.ID, []byte{1, 1}); err != nil {
		t.Fatal(err)
	}

	if err := screens.Push(screens.local.Share.ID, []byte{0, 2}); err != nil {
		t.Fatal(err)
	}

	if len(screens.viewers) != 0 {
		t.Fatal("full viewer queue was retained")
	}

	_ = receiver.SetReadDeadline(time.Now().Add(time.Second))

	if _, err := receiver.Read(make([]byte, 1)); err == nil {
		t.Fatal("slow viewer stayed open")
	}

	// Repeated epochs replace the cache instead of accumulating a recording.

	for range 100 {
		if err := screens.Push(screens.local.Share.ID, []byte{1, 3}); err != nil {
			t.Fatal(err)
		}
	}

	if len(screens.epoch) != 1 || screens.epochBytes != 2 {
		t.Fatal("epochs accumulated")
	}

	for range 31 {
		_ = screens.Push(screens.local.Share.ID, []byte{0, 4})
	}

	if err := screens.Push(screens.local.Share.ID, []byte{0, 5}); err == nil {
		t.Fatal("epoch chunk bound ignored")
	}
}

func TestScreenListValidation(t *testing.T) {
	good := &recording{ID: "0123456789abcdef", Codec: "video/webm;codecs=vp8"}

	if !validList(listing{Share: good}) || !validList(listing{}) {
		t.Fatal("valid list refused")
	}

	for _, invalid := range []recording{
		{ID: "0123456789ABCDEF", Codec: good.Codec},
		{ID: "short", Codec: good.Codec},
		{ID: good.ID, Codec: "video/webm;codecs=av1"},
		{ID: good.ID, Codec: "video/webm;codecs=vp8,opus"},
	} {
		if validList(listing{Share: &invalid}) {
			t.Fatalf("bad recording accepted: %+v", invalid)
		}
	}
}

func TestStopDropsIngestAndMedia(t *testing.T) {
	screens := New(nil)
	defer screens.Close()
	screens.local = listing{Share: &recording{ID: "0123456789abcdef"}}
	closed := 0

	if !screens.BindIngest(screens.local.Share.ID, func() { closed++ }) {
		t.Fatal("ingest refused")
	}

	if screens.BindIngest(screens.local.Share.ID, func() { closed++ }) {
		t.Fatal("duplicate ingest accepted")
	}

	_ = screens.Push(screens.local.Share.ID, []byte{1, 1, 2})
	screens.Stop(screens.local.Share.ID)

	if closed != 1 || screens.local.Share != nil || len(screens.epoch) != 0 || screens.epochBytes != 0 {
		t.Fatal("stop retained media or failed to close ingest")
	}

	if screens.Push("0123456789abcdef", []byte{1, 1}) == nil {
		t.Fatal("stopped ingest accepted")
	}

	if screens.BindIngest("0123456789abcdef", func() { closed++ }) {
		t.Fatal("stopped ingest rebound")
	}
}
