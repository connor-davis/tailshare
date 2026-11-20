package peer

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestChatBothWays(t *testing.T) {
	alice, bob := startPair(t, Options{DisplayName: "Alice"}, Options{DisplayName: "Bob"})
	ctx := testContext(t)

	sent, err := alice.SendChat(ctx, "hello Bob")
	if err != nil || sent.FromPeer || sent.Text != "hello Bob" || sent.ID == "" {
		t.Fatalf("sent = %+v, %v", sent, err)
	}
	if _, err := bob.SendChat(ctx, "hi Alice\nsecond line"); err != nil {
		t.Fatal(err)
	}

	bobLog := bob.Subscribe().Snapshot
	if len(bobLog) != 2 || !bobLog[0].FromPeer || bobLog[0].Text != "hello Bob" || bobLog[1].FromPeer {
		t.Fatalf("bob's log = %+v", bobLog)
	}

	aliceLog := alice.Subscribe().Snapshot
	if len(aliceLog) != 2 || aliceLog[0].FromPeer || !aliceLog[1].FromPeer {
		t.Fatalf("alice's log = %+v", aliceLog)
	}
	if aliceLog[0].Seq >= aliceLog[1].Seq {
		t.Fatalf("sequence does not grow: %+v", aliceLog)
	}
}

func TestChatLimits(t *testing.T) {
	alice, bob := startPair(t, Options{DisplayName: "Alice"}, Options{DisplayName: "Bob"})
	ctx := testContext(t)

	if _, err := alice.SendChat(ctx, strings.Repeat("a", maxChatText)); err != nil {
		t.Fatalf("exactly the cap: %v", err)
	}

	for name, text := range map[string]string{
		"too long": strings.Repeat("a", maxChatText+1),
		"empty":    "  \n ",
		"control":  "bad\x00text",
		"not utf8": "bad\xffbytes",
	} {
		if _, err := alice.SendChat(ctx, text); err == nil {
			t.Errorf("%s: message was sent", name)
		}
	}

	// A hostile peer skips our own check, so the receiver checks again.
	err := alice.Call(ctx, MethodChat, chatParams{ID: "x", Text: strings.Repeat("a", maxChatText+1)}, nil)
	if remote, ok := errors.AsType[*RemoteError](err); !ok || remote.Code != CodeBadRequest {
		t.Fatalf("receiver took an oversize message: %v", err)
	}

	err = alice.Call(ctx, MethodChat, chatParams{Text: "no id"}, nil)
	if remote, ok := errors.AsType[*RemoteError](err); !ok || remote.Code != CodeBadRequest {
		t.Fatalf("receiver took a message with no id: %v", err)
	}

	if log := bob.Subscribe().Snapshot; len(log) != 1 {
		t.Fatalf("bob kept %d messages, want only the valid one", len(log))
	}
}

func TestChatHistoryEvicts(t *testing.T) {
	alice, bob := startPair(t, Options{DisplayName: "Alice"}, Options{DisplayName: "Bob"})
	ctx := testContext(t)

	for i := range maxHistory + 5 {
		if _, err := alice.SendChat(ctx, fmt.Sprintf("message %d", i)); err != nil {
			t.Fatal(err)
		}
	}

	for name, peer := range map[string]*Peer{"sender": alice, "receiver": bob} {
		log := peer.Subscribe().Snapshot
		if len(log) != maxHistory || log[0].Text != "message 5" || log[maxHistory-1].Text != "message 204" {
			t.Errorf("%s keeps %d messages from %q to %q", name, len(log), log[0].Text, log[len(log)-1].Text)
		}
	}
}

func TestSubscribeHasNoGap(t *testing.T) {
	alice, bob := startPair(t, Options{DisplayName: "Alice"}, Options{DisplayName: "Bob"})
	ctx := testContext(t)

	if _, err := alice.SendChat(ctx, "before"); err != nil {
		t.Fatal(err)
	}

	subscription := bob.Subscribe()
	defer subscription.Close()

	if _, err := alice.SendChat(ctx, "after"); err != nil {
		t.Fatal(err)
	}

	if len(subscription.Snapshot) != 1 || subscription.Snapshot[0].Text != "before" {
		t.Fatalf("snapshot = %+v", subscription.Snapshot)
	}

	select {
	case event := <-subscription.Events:
		if event.Kind != EventChat || event.Chat.Text != "after" || event.Seq <= subscription.Snapshot[0].Seq {
			t.Fatalf("event = %+v", event)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no event")
	}
}

func TestSlowSubscriberIsCutOff(t *testing.T) {
	alice, bob := startPair(t, Options{DisplayName: "Alice"}, Options{DisplayName: "Bob"})
	subscription := bob.Subscribe()
	ctx := testContext(t)

	// Nobody reads, so the buffer fills and the subscription is closed
	// instead of holding up the connection.
	for range subscriberBuffer + 5 {
		if _, err := alice.SendChat(ctx, "x"); err != nil {
			t.Fatal(err)
		}
	}

	received := 0
	for range subscription.Events {
		received++
	}
	if received != subscriberBuffer {
		t.Fatalf("received %d, want the buffer's %d before the cut", received, subscriberBuffer)
	}

	// Subscribing again gives a fresh snapshot that holds everything.
	if log := bob.Subscribe().Snapshot; len(log) != subscriberBuffer+5 {
		t.Fatalf("fresh snapshot has %d messages", len(log))
	}
}

func TestAttachmentWireValidation(t *testing.T) {
	alice, bob := startPair(t, Options{DisplayName: "Alice"}, Options{DisplayName: "Bob"})
	good := &Attachment{Name: "report.pdf", Path: "docs/report.pdf", Size: 123}
	if _, err := alice.SendChat(testContext(t), "", good); err != nil {
		t.Fatal(err)
	}
	log := bob.Subscribe().Snapshot
	if len(log) != 1 || log[0].Attachment == nil || *log[0].Attachment != *good {
		t.Fatal(log)
	}
	for _, bad := range []*Attachment{
		{Name: "escape", Path: "../escape", Size: 1},
		{Name: "x", Path: "/x", Size: 1},
		{Name: "../x", Path: "x", Size: 1},
		{Name: "x", Path: "x", Size: -1},
		{Name: "", Path: "", Size: 0},
		{Name: "wrong", Path: "x", Size: 0},
	} {
		err := alice.Call(testContext(t), MethodChat, chatParams{ID: "bad", Text: "hello", Attachment: bad}, nil)
		if remote, ok := errors.AsType[*RemoteError](err); !ok || remote.Code != CodeBadRequest {
			t.Fatalf("accepted %+v: %v", bad, err)
		}
	}
	if len(bob.Subscribe().Snapshot) != 1 {
		t.Fatal("recorded invalid attachment")
	}
}
