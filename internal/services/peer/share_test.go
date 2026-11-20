package peer

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestShareLeaveEvents(t *testing.T) {
	raw, conversation := startAgainstRaw(t, Options{DisplayName: "Real"}, goodHello)
	subscription := conversation.Subscribe()
	defer subscription.Close()
	send := func(params string) {
		raw.send(t, envelope{
			Version: 1, Kind: KindEvent, Method: MethodShareLeave, Params: json.RawMessage(params),
		})
	}
	// Events cannot bypass hello; leave has no identity field to spoof.
	send("{}")
	greet(t, raw, 2)
	if reply := raw.read(t); reply.Error != nil {
		t.Fatal(reply.Error)
	}
	send(`{"id":"someone-else"}`)
	send("null")
	send(`{"padding":"` + strings.Repeat("x", MaxSharePayload) + `"}`)
	send("{ }")
	select {
	case event := <-subscription.Events:
		if event.Kind != EventShare || event.Method != MethodShareLeave || string(event.Params) != "{}" {
			t.Fatalf("unexpected event: %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("leave not published")
	}
	select {
	case event := <-subscription.Events:
		t.Fatalf("invalid leave leaked: %+v", event)
	default:
	}
}

func TestAllowDenyNotOnTheWire(t *testing.T) {
	left, _ := startPair(t, Options{DisplayName: "Left"}, Options{DisplayName: "Right"})
	for _, method := range []string{"share.allow", "share.deny"} {
		var remote *RemoteError
		err := left.Call(testContext(t), method, struct{}{}, nil)
		if !errors.As(err, &remote) || remote.Code != CodeUnknownMethod {
			t.Fatalf("%s = %v", method, err)
		}
	}
}

func TestV1HelloReplyHasVersionError(t *testing.T) {
	_, err := checkHello(helloResult{Version: 1, DisplayName: "Old peer"})
	var remote *RemoteError
	if !errors.As(err, &remote) || remote.Code != CodeUnsupportedVersion {
		t.Fatalf("v1 hello reply = %v", err)
	}
}
