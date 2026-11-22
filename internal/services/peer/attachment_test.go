package peer

import (
	"encoding/json"
	"testing"
)

func TestFolderAttachmentOptionalFields(t *testing.T) {
	for _, attachment := range []Attachment{
		{Name: "file.txt", Path: "file.txt", Size: 2},
		{Name: "Tree", Path: "Tree", Size: 12, Folder: true, Count: 3},
	} {
		if err := checkAttachment(&attachment); err != nil {
			t.Fatal(err)
		}

		wire, err := json.Marshal(attachment)
		if err != nil {
			t.Fatal(err)
		}

		// Older builds see the same name, path and size and ignore the new fields.
		var old struct {
			Name string
			Path string
			Size int64
		}

		if err := json.Unmarshal(wire, &old); err != nil || old.Name != attachment.Name ||
			old.Path != attachment.Path || old.Size != attachment.Size {
			t.Fatalf("%s: %+v %v", wire, old, err)
		}
	}

	for _, count := range []int64{-1, 10001} {
		if err := checkAttachment(&Attachment{Name: "Tree", Path: "Tree", Folder: true, Count: count}); err == nil {
			t.Fatal("accepted an invalid folder count")
		}
	}

	if err := checkAttachment(&Attachment{Name: "file.txt", Path: "file.txt", Count: 1}); err == nil {
		t.Fatal("accepted a folder count on a file")
	}
}
