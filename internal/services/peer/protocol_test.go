package peer

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"net"
	"strings"
	"testing"
	"time"
)

// rawSide is a hand-driven other computer, for sending frames a real peer never would.
type rawSide struct {
	conn   net.Conn
	frames *frameWriter
}

// startAgainstRaw starts a real peer on one end of a stream and answers its
// hello by hand. reply shapes the hello result; the real peer's Start result
// must succeed.
func startAgainstRaw(
	t *testing.T,
	options Options,
	reply helloResult,
) (*rawSide, *Peer) {
	t.Helper()

	local, remote := net.Pipe()
	t.Cleanup(func() { _ = remote.Close() })

	raw := &rawSide{conn: remote, frames: &frameWriter{writer: remote}}
	started := make(chan error, 1)
	peers := make(chan *Peer, 1)

	go func() {
		peer, err := Start(testContext(t), local, options)
		peers <- peer
		started <- err
	}()

	hello := raw.read(t)
	if hello.Method != MethodHello {
		t.Fatalf("first frame was %q, want hello", hello.Method)
	}

	result, _ := json.Marshal(reply)
	raw.send(t, envelope{Version: 1, Kind: KindResponse, ID: hello.ID, Result: result})

	if err := <-started; err != nil {
		t.Fatal(err)
	}

	peer := <-peers
	if peer != nil {
		t.Cleanup(func() { _ = peer.Close() })
	}

	return raw, peer
}

func (raw *rawSide) read(t *testing.T) envelope {
	t.Helper()

	_ = raw.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	payload, err := readFrame(raw.conn)
	if err != nil {
		t.Fatal(err)
	}

	var message envelope
	if err := json.Unmarshal(payload, &message); err != nil {
		t.Fatal(err)
	}

	return message
}

func (raw *rawSide) send(t *testing.T, message envelope) {
	t.Helper()

	_ = raw.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := raw.frames.write(message); err != nil {
		t.Fatal(err)
	}
}

func (raw *rawSide) sendRaw(t *testing.T, data []byte) {
	t.Helper()

	_ = raw.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	_, _ = raw.conn.Write(data)
}

var goodHello = helloResult{Version: 2, DisplayName: "Raw"}

func greet(t *testing.T, raw *rawSide, versions ...int) {
	t.Helper()

	params, _ := json.Marshal(helloParams{Versions: versions, DisplayName: "Raw"})
	raw.send(t, envelope{Version: 1, Kind: KindRequest, ID: "r1", Method: MethodHello, Params: params})
}

func waitClosed(t *testing.T, peer *Peer, why string) {
	t.Helper()

	select {
	case <-peer.Done():
	case <-time.After(5 * time.Second):
		t.Fatalf("%s did not close the connection", why)
	}
}

func TestBrokenFramesCloseThePeer(t *testing.T) {
	frame := func(payload string) []byte {
		return append(binary.BigEndian.AppendUint32(nil, uint32(len(payload))), payload...)
	}

	cases := map[string][]byte{
		"invalid json":        frame("{nope"),
		"not an object":       frame("null"),
		"wrong version":       frame(`{"version":2,"kind":"event","method":"x"}`),
		"unknown kind":        frame(`{"version":1,"kind":"shout"}`),
		"request without id":  frame(`{"version":1,"kind":"request","method":"list"}`),
		"response without id": frame(`{"version":1,"kind":"response"}`),
		"oversize header":     binary.BigEndian.AppendUint32(nil, maxFrame+1),
		"zero length":         binary.BigEndian.AppendUint32(nil, 0),
		"cut off body":        append(binary.BigEndian.AppendUint32(nil, 50), "short"...),
	}

	for name, data := range cases {
		t.Run(name, func(t *testing.T) {
			raw, peer := startAgainstRaw(t, Options{DisplayName: "Real"}, goodHello)
			raw.sendRaw(t, data)

			if name == "cut off body" {
				_ = raw.conn.Close()
			}

			waitClosed(t, peer, name)
		})
	}
}

func TestVersionNegotiation(t *testing.T) {
	t.Run("v1 peer is refused", func(t *testing.T) {
		raw, _ := startAgainstRaw(t, Options{DisplayName: "Real"}, goodHello)
		greet(t, raw, 1)
		answer := raw.read(t)
		if answer.Error == nil || answer.Error.Code != CodeUnsupportedVersion {
			t.Fatalf("v1 hello = %+v", answer)
		}
	})

	t.Run("they are too new", func(t *testing.T) {
		local, remote := net.Pipe()
		defer remote.Close()
		raw := &rawSide{conn: remote, frames: &frameWriter{writer: remote}}

		failed := make(chan error, 1)
		go func() {
			_, err := Start(testContext(t), local, Options{DisplayName: "Real"})
			failed <- err
		}()

		hello := raw.read(t)
		bad, _ := json.Marshal(helloResult{Version: 99, DisplayName: "Raw"})
		raw.send(t, envelope{Version: 1, Kind: KindResponse, ID: hello.ID, Result: bad})

		if err := <-failed; err == nil || err.Error() != errVersion.Error() {
			t.Fatalf("Start with a version we do not speak: %v", err)
		}
	})

	t.Run("they offer none we speak", func(t *testing.T) {
		raw, peer := startAgainstRaw(t, Options{DisplayName: "Real"}, goodHello)
		greet(t, raw, 98, 99)

		answer := raw.read(t)
		if answer.Error == nil || answer.Error.Code != CodeUnsupportedVersion {
			t.Fatalf("answer = %+v", answer)
		}

		select {
		case <-peer.Done():
			t.Fatal("a refused hello should not close the connection by itself")
		default:
		}
	})

	t.Run("highest common version wins", func(t *testing.T) {
		raw, _ := startAgainstRaw(t, Options{DisplayName: "Real"}, goodHello)
		greet(t, raw, 7, 1, 2, 3)

		answer := raw.read(t)
		var result helloResult
		if err := json.Unmarshal(answer.Result, &result); err != nil || result.Version != 2 {
			t.Fatalf("answer = %+v, %v", answer, err)
		}
	})
}

func TestHostileNamesAreRefused(t *testing.T) {
	for _, name := range []string{"bad\x1b[31mname", "", strings.Repeat("n", maxDisplayName+1)} {
		local, remote := net.Pipe()
		raw := &rawSide{conn: remote, frames: &frameWriter{writer: remote}}

		failed := make(chan error, 1)
		go func() {
			_, err := Start(testContext(t), local, Options{DisplayName: "Real"})
			failed <- err
		}()

		hello := raw.read(t)
		bad, _ := json.Marshal(helloResult{Version: 2, DisplayName: name})
		raw.send(t, envelope{Version: 1, Kind: KindResponse, ID: hello.ID, Result: bad})

		if err := <-failed; err == nil || err.Error() != errBadName.Error() {
			t.Errorf("name %q: %v", name, err)
		}

		_ = remote.Close()
	}
}

func TestRequestsBeforeHelloAreRefused(t *testing.T) {
	raw, _ := startAgainstRaw(t, Options{DisplayName: "Real"}, goodHello)

	raw.send(t, envelope{Version: 1, Kind: KindRequest, ID: "r1", Method: MethodList})
	answer := raw.read(t)
	if answer.Error == nil || answer.Error.Code != CodeNotReady {
		t.Fatalf("answer = %+v", answer)
	}

	// A second hello must not be able to replace the first.
	greet(t, raw, 2)
	if first := raw.read(t); first.Error != nil {
		t.Fatalf("first hello refused: %+v", first)
	}

	greet(t, raw, 2)
	if second := raw.read(t); second.Error == nil || second.Error.Code != CodeBadRequest {
		t.Fatalf("second hello = %+v", second)
	}
}

func TestStrayResponseIsIgnored(t *testing.T) {
	raw, peer := startAgainstRaw(t, Options{DisplayName: "Real"}, goodHello)
	raw.send(t, envelope{Version: 1, Kind: KindResponse, ID: "999", Result: json.RawMessage(`{}`)})

	select {
	case <-peer.Done():
		t.Fatal("an unmatched response closed the connection")
	case <-time.After(100 * time.Millisecond):
	}
}

func TestTooManyOpenRequestsCloseThePeer(t *testing.T) {
	block := make(chan struct{})
	defer close(block)

	raw, peer := startAgainstRaw(t, Options{DisplayName: "Real", Handlers: map[string]Handler{
		"block": func(ctx context.Context, _ json.RawMessage) (any, error) {
			select {
			case <-block:
			case <-ctx.Done():
			}

			return struct{}{}, nil
		},
	}}, goodHello)
	greet(t, raw, 2)

	go func() {
		for i := range maxInflight + 2 {
			message := envelope{Version: 1, Kind: KindRequest, ID: string(rune('a' + i)), Method: "block"}
			if raw.frames.write(message) != nil {
				return
			}
		}
	}()

	// Drain what the peer says so its answers never block the test.
	go func() {
		for {
			if _, err := readFrame(raw.conn); err != nil {
				return
			}
		}
	}()

	waitClosed(t, peer, "a flood of open requests")
}

func TestEnvelopeErrorsAreTyped(t *testing.T) {
	err := error(&RemoteError{Code: CodeDenied, Message: "That is not available."})
	if got := remoteError(err); got.Code != CodeDenied {
		t.Fatalf("remoteError changed a typed error: %+v", got)
	}
	if got := remoteError(errors.New("open /home/x: no such file")); got.Code != CodeInternal {
		t.Fatalf("untyped error became %+v", got)
	}
}
