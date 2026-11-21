package peer

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"strings"
	"testing"
)

func TestAuditOversizedAttachmentRefused(t *testing.T) {
	local, _ := startPair(t, Options{DisplayName: "Local"}, Options{DisplayName: "Remote"})
	for _, attachment := range []*Attachment{
		{Name: strings.Repeat("x", 100000), Path: strings.Repeat("x", 100000)},
		{Name: "file", Path: "file", Size: 1<<40 + 1},
	} {
		raw, _ := json.Marshal(chatParams{ID: "test", Attachment: attachment})
		if _, err := local.handleChat(raw); err == nil {
			t.Fatal("oversized attachment accepted")
		}
	}
	if len(local.Subscribe().Snapshot) != 0 {
		t.Fatal("refused chat retained")
	}
}

type allocationProbe struct {
	header    []byte
	requested int
}

func (probe *allocationProbe) Read(buffer []byte) (int, error) {
	if len(probe.header) != 0 {
		count := copy(buffer, probe.header)
		probe.header = probe.header[count:]
		return count, nil
	}
	probe.requested = max(probe.requested, len(buffer))
	return 0, bytes.ErrTooLarge
}

func TestAuditFrameAllocatedIncrementally(t *testing.T) {
	var header [4]byte
	binary.BigEndian.PutUint32(header[:], maxFrame)
	probe := &allocationProbe{header: header[:]}
	_, _ = readFrame(probe)
	if probe.requested > 64<<10 {
		t.Fatalf("allocated %d bytes before body arrived", probe.requested)
	}
}
