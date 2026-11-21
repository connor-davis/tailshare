package api

import (
	"bytes"
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/screen"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
	"github.com/fasthttp/websocket"
)

func screenDial(t *testing.T, f *fixture, path string) *websocket.Conn {
	t.Helper()
	dialer := websocket.Dialer{Subprotocols: []string{wsProtocol, testToken}, HandshakeTimeout: 5 * time.Second}
	conn, _, err := dialer.Dial("ws://"+f.host+path, nil)

	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

func screenRead(t *testing.T, conn *websocket.Conn, want []byte) {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(20 * time.Second))
	kind, got, err := conn.ReadMessage()

	if err != nil || kind != websocket.BinaryMessage || !bytes.Equal(got, want) {
		t.Fatalf("media mismatch: kind %d, got %d bytes, want %d, error %v", kind, len(got), len(want), err)
	}
}

func screenWrite(t *testing.T, conn *websocket.Conn, chunk []byte) {
	t.Helper()
	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))

	if err := conn.WriteMessage(websocket.BinaryMessage, chunk); err != nil {
		t.Fatal(err)
	}
}

func TestScreenIngestAuthentication(t *testing.T) {
	fixture := newFixture(t, config.Config{}, nil)

	for _, path := range []string{"/api/screen/ingest/0123456789abcdef", "/api/screen/watch/0123456789abcdef"} {
		for _, protocols := range [][]string{nil, {wsProtocol, "wrong"}, {testToken}} {
			dialer := websocket.Dialer{Subprotocols: protocols}
			conn, response, err := dialer.Dial("ws://"+fixture.host+path, http.Header{})

			if conn != nil {
				_ = conn.Close()
			}

			if err == nil || response == nil || (response.StatusCode != 401 && response.StatusCode != 400) {
				t.Fatalf("unprotected media endpoint: %v, %v", response, err)
			}
		}
	}
}

func TestScreenRoomFanoutAndCleanup(t *testing.T) {
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}
	host := newFixture(t, cfg, nil)
	fast := newFixture(t, cfg, nil)
	slow := newFixture(t, cfg, nil)
	hosting := host.send("POST", "/api/session/host", nil)
	hosting.expect(t, 201, "")
	code := hosting.Body["code"].(string)
	joinWithApproval(t, host, fast, code).expect(t, 200, "")

	started := host.send("POST", "/api/screen", map[string]string{"codec": "video/webm;codecs=vp8"})
	started.expect(t, 201, "")
	id := started.Body["id"].(string)
	ingest := screenDial(t, host, "/api/screen/ingest/"+id)
	init := append([]byte{1}, []byte("fake WebM initialization")...)
	screenWrite(t, ingest, init)

	// A later member discovers an already-running recording through screen.list.
	joinWithApproval(t, host, slow, code).expect(t, 200, "")

	for _, fixture := range []*fixture{fast, slow} {
		eventually(t, "screen announcement", func() bool { return len(fixture.server.screenState().Others) == 1 })
	}

	first := screenDial(t, fast, "/api/screen/watch/"+id)
	second := screenDial(t, slow, "/api/screen/watch/"+id)
	screenRead(t, first, init)
	screenRead(t, second, init)

	for index := range 5 {
		chunk := []byte{0, byte(index), 11, 22, 33}
		screenWrite(t, ingest, chunk)
		screenRead(t, first, chunk)
		screenRead(t, second, chunk)
	}

	eventually(t, "two screen viewers", func() bool { return host.server.screenState().Mine[0].Viewers == 2 })

	// This viewer stops reading. Even full socket buffers cannot stall the producer
	// or the other member; each fake epoch also proves retained history is bounded.
	chunk := make([]byte, 128<<10)

	for index := range 192 {
		chunk[0] = 0

		if index%8 == 0 {
			chunk[0] = 1
		}

		chunk[1] = byte(index)
		screenWrite(t, ingest, chunk)
		screenRead(t, first, chunk)
	}

	eventually(t, "slow viewer disconnection", func() bool { return host.server.screenState().Mine[0].Viewers == 1 })

	// Unknown share IDs close without disclosing media in both link directions.

	for _, pair := range [][2]*fixture{{fast, host}, {host, fast}} {
		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		conn, err := pair[0].server.sess.OpenStream(ctx, pair[1].server.sess.SelfID(), screen.Kind, []byte("0000000000000000"))
		cancel()

		if err != nil {
			t.Fatal(err)
		}

		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, err = screen.ReadChunk(conn)
		_ = conn.Close()

		if err == nil {
			t.Fatal("unknown recording was served")
		}
	}

	host.send("DELETE", "/api/screen/"+id, nil).expect(t, 200, "")
	_ = first.SetReadDeadline(time.Now().Add(10 * time.Second))

	if _, _, err := first.ReadMessage(); err == nil {
		t.Fatal("stop left a viewer open")
	}

	_ = ingest.SetReadDeadline(time.Now().Add(10 * time.Second))

	if _, _, err := ingest.ReadMessage(); err == nil {
		t.Fatal("stop left ingest open")
	}

	eventually(t, "stop announcement", func() bool { return len(fast.server.screenState().Others) == 0 })

	// Share in the other link direction and leave with a viewer still watching.
	started = fast.send("POST", "/api/screen", map[string]string{"codec": "video/webm;codecs=vp9"})
	started.expect(t, 201, "")
	id = started.Body["id"].(string)
	ingest = screenDial(t, fast, "/api/screen/ingest/"+id)
	screenWrite(t, ingest, init)
	eventually(t, "reverse recording", func() bool { return len(host.server.screenState().Others) == 1 })
	watching := screenDial(t, host, "/api/screen/watch/"+id)
	screenRead(t, watching, init)
	fast.send("DELETE", "/api/session", nil).expect(t, 200, "")
	_ = watching.SetReadDeadline(time.Now().Add(15 * time.Second))

	if _, _, err := watching.ReadMessage(); err == nil {
		t.Fatal("leave left a viewer open")
	}

	eventually(t, "departed recording removal", func() bool { return len(host.server.screenState().Others) == 0 })
}
