package session

import (
	"context"
	"net"
	"testing"
	"time"
)

// echoKind registers a handler that hands each stream and its header to a channel.
func echoKind(t *testing.T, session *Session, kind byte) chan streamArrival {
	t.Helper()
	arrivals := make(chan streamArrival, 4)
	err := session.HandleStream(kind, func(memberID string, header []byte, conn net.Conn) {
		arrivals <- streamArrival{memberID, header, conn}
	})
	if err != nil {
		t.Fatal(err)
	}
	return arrivals
}

type streamArrival struct {
	member string
	header []byte
	conn   net.Conn
}

func TestOpenStreamBothDirections(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	joiner := connectJoiner(t, host, code, options)
	atHost, atJoiner := echoKind(t, host, 7), echoKind(t, joiner, 7)

	// The joiner dialed the link: it opens directly. The host has no outgoing
	// link, so its request goes through the reverse path.
	for _, test := range []struct {
		name            string
		opener, handler *Session
		arrivals        chan streamArrival
	}{
		{"newer to older", joiner, host, atHost},
		{"older to newer", host, joiner, atJoiner},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(t.Context(), 20*time.Second)
			defer cancel()
			conn, err := test.opener.OpenStream(ctx, test.handler.SelfID(), 7, []byte("share-1"))
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()

			select {
			case arrival := <-test.arrivals:
				defer arrival.conn.Close()
				if arrival.member != test.opener.SelfID() || string(arrival.header) != "share-1" {
					t.Fatalf("handler saw member %q header %q", arrival.member, arrival.header)
				}
				exchange(t, conn, arrival.conn, "request")
				exchange(t, arrival.conn, conn, "answer")
			case <-ctx.Done():
				t.Fatal("handler never saw the stream")
			}
		})
	}
}

func TestOpenStreamUnknownKindIsClosed(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	joiner := connectJoiner(t, host, code, options)

	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Second)
	defer cancel()
	// The joiner reaches the host directly; the host asks the joiner by request.
	conn, err := joiner.OpenStream(ctx, host.SelfID(), 9, nil)
	if err == nil {
		defer conn.Close()
		_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
		if _, err := conn.Read(make([]byte, 1)); err == nil {
			t.Fatal("an unregistered kind kept its stream open")
		}
	}
	if _, err := host.OpenStream(ctx, joiner.SelfID(), 9, nil); err == nil {
		t.Fatal("a request for an unregistered kind succeeded")
	}
}

func TestStreamKindRules(t *testing.T) {
	options := localSettings(t)
	host, _ := startHost(t, options)
	handler := func(string, []byte, net.Conn) {}

	if host.HandleStream(0, handler) == nil {
		t.Fatal("the reverse kind was registrable")
	}
	if err := host.HandleStream(3, handler); err != nil {
		t.Fatal(err)
	}
	if host.HandleStream(3, handler) == nil {
		t.Fatal("a kind was registered twice")
	}
}
