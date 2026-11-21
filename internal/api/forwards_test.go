package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/forward"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

func TestForwardRoutesNeedARoomAndAToken(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	for _, route := range [][2]string{
		{"GET", "/api/forwards"}, {"POST", "/api/forwards"}, {"DELETE", "/api/forwards/x"},
		{"POST", "/api/forwards/x/open"}, {"DELETE", "/api/forwards/x/open"},
	} {
		got := f.send(route[0], route[1], nil, withoutToken)
		if got.Status != 401 {
			t.Fatalf("%v without a token = %d", route, got.Status)
		}
	}

	// With no room, a share, a stop and an open all say there is nothing to do.
	f.send("POST", "/api/forwards", map[string]any{"port": 80, "label": "x"}).expect(t, 409, "not_connected")
	f.send("DELETE", "/api/forwards/x", nil).expect(t, 409, "not_connected")
	f.send("POST", "/api/forwards/x/open", nil).expect(t, 409, "not_connected")
	f.send("DELETE", "/api/forwards/x/open", nil).expect(t, 409, "not_connected")

	// The list is always readable and is empty.
	got := f.send("GET", "/api/forwards", nil)
	got.expect(t, 200, "")
	if string(got.Raw) != `{"mine":[],"others":[],"unsupported":[]}` {
		t.Fatalf("empty state = %s", got.Raw)
	}
}

func hostedFixture(t *testing.T) *fixture {
	t.Helper()
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	f := newFixture(t, config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}, nil)
	f.send("POST", "/api/session/host", nil).expect(t, 201, "")
	t.Cleanup(f.server.leave)
	return f
}

func TestShareForwardValidationAndLiveEvent(t *testing.T) {
	f := hostedFixture(t)
	live := f.dialLive()
	defer live.Close()
	next(t, live)

	for name, body := range map[string]any{
		"port zero":       map[string]any{"port": 0, "label": "x"},
		"port too big":    map[string]any{"port": 65536, "label": "x"},
		"port as text":    map[string]any{"port": "80", "label": "x"},
		"empty label":     map[string]any{"port": 80, "label": " "},
		"long label":      map[string]any{"port": 80, "label": strings.Repeat("a", 65)},
		"control in name": map[string]any{"port": 80, "label": "a\nb"},
	} {
		t.Run(name, func(t *testing.T) {
			got := f.send("POST", "/api/forwards", body)
			if got.Status != 400 {
				t.Fatalf("status = %d (%s)", got.Status, got.Raw)
			}
		})
	}
	f.send("POST", "/api/forwards", "not json").expect(t, 400, "")

	created := f.send("POST", "/api/forwards", map[string]any{"port": 3000, "label": "Dev server"})
	created.expect(t, 201, "")
	id := created.Body["id"].(string)

	event := until(t, live, "forward.changed", nil)
	var state forward.State
	if err := json.Unmarshal(mustJSON(event.Data), &state); err != nil {
		t.Fatal(err)
	}
	if len(state.Mine) != 1 || state.Mine[0].ID != id || state.Mine[0].Port != 3000 {
		t.Fatalf("event state = %+v", state)
	}

	// A new live client gets the share in its snapshot.
	fresh := f.dialLive()
	defer fresh.Close()
	var snapshot Snapshot
	if err := json.Unmarshal(mustJSON(next(t, fresh).Data), &snapshot); err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Forwards.Mine) != 1 {
		t.Fatalf("snapshot forwards = %+v", snapshot.Forwards)
	}

	// A share the viewer cannot see is not found, and a stop of someone else's is too.
	f.send("POST", "/api/forwards/nope/open", nil).expect(t, 404, "not_found")
	f.send("DELETE", "/api/forwards/nope/open", nil).expect(t, 404, "not_found")
	f.send("DELETE", "/api/forwards/nope", nil).expect(t, 404, "not_found")
	f.send("POST", "/api/forwards/"+id+"/open", nil).expect(t, 404, "not_found")

	f.send("DELETE", "/api/forwards/"+id, nil).expect(t, 200, "")
	got := f.send("GET", "/api/forwards", nil)
	if !strings.Contains(string(got.Raw), `"mine":[]`) {
		t.Fatalf("after stop = %s", got.Raw)
	}
}

func TestShareForwardLimit(t *testing.T) {
	f := hostedFixture(t)

	for i := range 16 {
		f.send("POST", "/api/forwards", map[string]any{"port": 3000 + i, "label": "app"}).expect(t, 201, "")
	}
	f.send("POST", "/api/forwards", map[string]any{"port": 4000, "label": "one more"}).expect(t, 409, "limit")
}

func TestAPIForwardsOverLocalDERP(t *testing.T) {
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}
	host, join := newFixture(t, cfg, nil), newFixture(t, cfg, nil)
	hosted := host.send("POST", "/api/session/host", nil)
	hosted.expect(t, 201, "")
	t.Cleanup(func() { host.server.leave(); join.server.leave() })
	joinWithApproval(t, host, join, hosted.Body["code"].(string)).expect(t, 200, "")

	// Each side shares a web page and the other fetches it: both link directions.
	for _, test := range []struct {
		name           string
		sharer, viewer *fixture
	}{
		{"older shares", host, join},
		{"newer shares", join, host},
	} {
		t.Run(test.name, func(t *testing.T) {
			body := "hello from " + test.name
			web := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = io.WriteString(w, body)
			}))
			defer web.Close()
			_, port, _ := net.SplitHostPort(web.Listener.Addr().String())
			number, _ := strconv.Atoi(port)

			viewer := test.viewer
			live := viewer.dialLive()
			defer live.Close()
			next(t, live)

			created := test.sharer.send("POST", "/api/forwards", map[string]any{"port": number, "label": "Web"})
			created.expect(t, 201, "")
			id := created.Body["id"].(string)

			// The viewer hears about it without polling.
			until(t, live, "forward.changed", func(event Event) bool {
				return strings.Contains(string(mustJSON(event.Data)), id)
			})

			opened := viewer.send("POST", "/api/forwards/"+id+"/open", nil)
			opened.expect(t, 200, "")
			local := int(opened.Body["localPort"].(float64))
			if local == 0 || opened.Body["open"] != true {
				t.Fatalf("open = %s", opened.Raw)
			}

			client := http.Client{Timeout: 20 * time.Second}
			response, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/", local))
			if err != nil {
				t.Fatal(err)
			}
			got, _ := io.ReadAll(response.Body)
			response.Body.Close()
			if string(got) != body {
				t.Fatalf("got %q, want %q", got, body)
			}

			viewer.send("DELETE", "/api/forwards/"+id+"/open", nil).expect(t, 200, "")
			if conn, err := net.Dial("tcp4", fmt.Sprintf("127.0.0.1:%d", local)); err == nil {
				_ = conn.Close()
				t.Fatal("the listener stayed open after Close")
			}
			test.sharer.send("DELETE", "/api/forwards/"+id, nil).expect(t, 200, "")
		})
	}
}
