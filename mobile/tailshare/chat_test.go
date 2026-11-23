package tailshare

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

type chatResult struct {
	event string
	err   error
}

// startChatRig joins a phone to a host and waits until the host can talk back.
func startChatRig(t *testing.T) (*session.Session, *Client, *peer.Peer) {
	t.Helper()
	mapURL := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	host, code := startHost(t, mapURL)

	client := NewClient("Phone", mapURL, int(tailcattest.RegionID))
	t.Cleanup(func() { _ = client.Leave() })

	joined := make(chan error, 1)
	go func() { joined <- client.Join(code) }()
	approve(t, host)
	if err := <-joined; err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		if control, ok := host.Control(client.session.SelfID()); ok {
			return host, client, control
		}
		if time.Now().After(deadline) {
			t.Fatal("host never registered the phone")
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func readChat(client *Client) chan chatResult {
	out := make(chan chatResult, 1)
	go func() {
		event, err := client.NextChatEvent()
		out <- chatResult{event, err}
	}()

	return out
}

func waitChat(t *testing.T, out chan chatResult) chatResult {
	t.Helper()
	select {
	case got := <-out:
		return got
	case <-time.After(5 * time.Second):
		t.Fatal("NextChatEvent did not return")
		return chatResult{}
	}
}

func decodeChat(t *testing.T, event string) chatEvent {
	t.Helper()
	var decoded chatEvent
	if err := json.Unmarshal([]byte(event), &decoded); err != nil {
		t.Fatalf("bad json %q: %v", event, err)
	}

	return decoded
}

func TestChatPhoneToHost(t *testing.T) {
	_, client, control := startChatRig(t)

	history := control.Subscribe()
	defer history.Close()

	if err := client.SendChat("hello desktop"); err != nil {
		t.Fatal(err)
	}

	select {
	case event := <-history.Events:
		if event.Chat == nil || event.Chat.Text != "hello desktop" || !event.Chat.FromPeer {
			t.Fatalf("host got %+v", event)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("host never got the message")
	}

	// The phone's own message comes back through its stream as mine.
	got := waitChat(t, readChat(client))
	message := decodeChat(t, got.event)
	if got.err != nil || message.Type != "chat" || message.Text != "hello desktop" || !message.Mine {
		t.Fatalf("history = %+v %+v", got, message)
	}
	if message.FromName != "Phone" || message.SentAt == "" || message.ID == "" {
		t.Fatalf("fields = %+v", message)
	}
}

func TestChatHostToPhone(t *testing.T) {
	_, client, control := startChatRig(t)

	// The first call subscribes with an empty history, then blocks for news.
	pending := readChat(client)
	time.Sleep(100 * time.Millisecond)

	if _, err := control.SendChat(t.Context(), "hello phone"); err != nil {
		t.Fatal(err)
	}

	got := waitChat(t, pending)
	message := decodeChat(t, got.event)
	if got.err != nil || message.Text != "hello phone" || message.Mine || message.FromName != "Desktop" {
		t.Fatalf("got = %+v %+v", got, message)
	}
}

func TestChatRefusesBadText(t *testing.T) {
	_, client, _ := startChatRig(t)

	if err := client.SendChat("   "); err == nil {
		t.Fatal("empty text was sent")
	}
	if err := client.SendChat(strings.Repeat("a", 8<<10+1)); err == nil {
		t.Fatal("too long text was sent")
	}
}

func TestLeaveWakesChatReader(t *testing.T) {
	_, client, _ := startChatRig(t)

	pending := readChat(client)
	time.Sleep(100 * time.Millisecond)
	if err := client.Leave(); err != nil {
		t.Fatal(err)
	}

	if got := waitChat(t, pending); got.err != nil || got.event != `{"type":"closed"}` {
		t.Fatalf("closed = %+v", got)
	}
	if got := waitChat(t, readChat(client)); got.err == nil {
		t.Fatalf("after close = %+v, want an error", got)
	}
}
