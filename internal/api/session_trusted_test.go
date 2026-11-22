package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
	"tailscale.com/types/key"
)

func TestMainOnlyTrustRoutes(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	for _, endpoint := range []struct{ method, path string }{
		{"PUT", "/api/session/trusted"}, {"GET", "/api/session/joins/1/key"},
	} {
		f.send(endpoint.method, endpoint.path, nil).expect(t, 403, "forbidden")
		f.send(endpoint.method, endpoint.path, nil, func(request *http.Request) {
			request.Header.Set("X-Tailshare-Main", "wrong")
		}).expect(t, 403, "forbidden")
		f.send(endpoint.method, endpoint.path, nil, mainHeader, func(request *http.Request) {
			request.Header.Del("Authorization")
		}).expect(t, 401, "unauthorized")
	}
}

func TestPutTrustedValidates(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	good := key.NewNode().Public().String()

	f.send("PUT", "/api/session/trusted", map[string]any{"keys": []string{good}}, mainHeader).
		expect(t, 200, "")
	if !f.server.trusted.Has(good) {
		t.Fatal("the key was not saved")
	}

	tooMany := make([]string, 101)
	for i := range tooMany {
		tooMany[i] = key.NewNode().Public().String()
	}
	for name, body := range map[string]any{
		"junk key":   map[string]any{"keys": []string{"nope"}},
		"too many":   map[string]any{"keys": tooMany},
		"upper":      map[string]any{"keys": []string{strings.ToUpper(good)}},
		"wrong type": map[string]any{"keys": "nodekey:abc"},
	} {
		f.send("PUT", "/api/session/trusted", body, mainHeader).expect(t, 400, "bad_request")
		if !f.server.trusted.Has(good) {
			t.Fatalf("%s changed the saved list", name)
		}
	}

	f.send("PUT", "/api/session/trusted", map[string]any{"keys": []string{}}, mainHeader).
		expect(t, 200, "")
	if f.server.trusted.Has(good) {
		t.Fatal("an empty list did not revoke")
	}
}

func TestJoinKeyAndTrustedAdmission(t *testing.T) {
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	identity := key.NewNode()
	hostCfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}
	joinCfg := hostCfg
	secret, err := identity.MarshalText()
	if err != nil {
		t.Fatal(err)
	}
	joinCfg.Identity = string(secret)
	host, join := newFixture(t, hostCfg, nil), newFixture(t, joinCfg, nil)

	for _, id := range []string{"0", "nope", "01"} {
		host.send("GET", "/api/session/joins/"+id+"/key", nil, mainHeader).expect(t, 400, "bad_request")
	}
	host.send("GET", "/api/session/joins/1/key", nil, mainHeader).expect(t, 409, "conflict")

	hosted := host.send("POST", "/api/session/host", nil)
	hosted.expect(t, 201, "")
	live := host.dialLive()
	defer live.Close()
	next(t, live)
	results := make(chan reply, 1)
	go func() {
		results <- join.send("POST", "/api/session/join", map[string]any{"code": hosted.Body["code"]})
	}()
	event := until(t, live, "session.state", func(event Event) bool {
		var state SessionState
		_ = json.Unmarshal(mustJSON(event.Data), &state)
		return state.Join != nil
	})
	var state SessionState
	if err := json.Unmarshal(mustJSON(event.Data), &state); err != nil {
		t.Fatal(err)
	}

	// A stale ID is refused, and the page's own token cannot read the key at all.
	host.send("GET", fmt.Sprintf("/api/session/joins/%d/key", state.Join.ID+1), nil, mainHeader).
		expect(t, 404, "not_found")
	host.send("GET", fmt.Sprintf("/api/session/joins/%d/key", state.Join.ID), nil).
		expect(t, 403, "forbidden")

	got := host.send("GET", fmt.Sprintf("/api/session/joins/%d/key", state.Join.ID), nil, mainHeader)
	got.expect(t, 200, "")
	public := identity.Public().String()
	if got.Body["key"] != public || got.Body["fingerprint"] != state.Join.Fingerprint ||
		got.Body["displayName"] != state.Join.DisplayName {
		t.Fatalf("key reply = %s, want key %s", got.Raw, public)
	}

	host.send("POST", fmt.Sprintf("/api/session/joins/%d/allow", state.Join.ID), nil).expect(t, 200, "")
	(<-results).expect(t, 200, "")

	host.send("GET", fmt.Sprintf("/api/session/joins/%d/key", state.Join.ID), nil, mainHeader).
		expect(t, 409, "conflict")
}
