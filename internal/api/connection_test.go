package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
	"tailscale.com/tailcfg"
)

func TestRegionMainOnlyAndNextRoomConfig(t *testing.T) {
	fixture := newFixture(t, config.Config{Region: 303}, nil)
	main := func(request *http.Request) { request.Header.Set("X-Tailshare-Main", fixture.server.cfg.MainToken) }
	path := "/api/connection/region"
	if got := fixture.send("PUT", path, map[string]string{"relayRegion": "304"}); got.Status != 403 {
		t.Fatalf("renderer may change region: %d", got.Status)
	}
	if got := fixture.send("PUT", path, map[string]string{"relayRegion": "bad"}, main); got.Status != 400 {
		t.Fatalf("accepted bad region: %d %s", got.Status, got.Raw)
	}
	if got := fixture.send("PUT", path, map[string]string{"relayRegion": "nearest"}, main); got.Status != 200 {
		t.Fatalf("main failed: %d %s", got.Status, got.Raw)
	}
	cfg := fixture.server.connectionConfig()
	if !cfg.Nearest || cfg.Region != 303 || fixture.server.cfg.Nearest {
		t.Fatal("runtime preference mutated startup settings or was not applied")
	}
}

func TestConnectionRouteOffline(t *testing.T) {
	relay := tailcattest.LocalDERP(t)
	region := relay.Regions[tailcattest.RegionID]
	region.RegionID = 303
	for _, node := range region.Nodes {
		node.RegionID = 303
	}
	relay.Regions = map[tailcfg.DERPRegionID]*tailcfg.DERPRegion{303: region}
	fixture := newFixture(t, config.Config{DERPMapURL: tailcattest.ServeMap(t, relay)}, nil)
	got := fixture.send("POST", "/api/connection/test", nil)
	if got.Status != 200 || got.Body["udp"] != true || got.Body["nearest"] != "FRA" {
		t.Fatalf("test failed: %d %s", got.Status, got.Raw)
	}
	if _, exposed := got.Body["GlobalV4"]; exposed {
		t.Fatal("public address exposed")
	}
}

func TestPathArrivesOverSessionSocket(t *testing.T) {
	relay := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: relay}
	host := newFixture(t, cfg, nil)
	joiner := newFixture(t, cfg, nil)
	live := joiner.dialLive()
	next(t, live)
	hosting := host.send("POST", "/api/session/host", nil)
	hosting.expect(t, 201, "")
	code := hosting.Body["code"].(string)
	joined := joinWithApproval(t, host, joiner, code)
	joined.expect(t, 200, "")
	event := until(t, live, "session.state", func(event Event) bool {
		var state SessionState
		if json.Unmarshal(mustJSON(event.Data), &state) != nil {
			return false
		}
		for _, member := range state.Members {
			if !member.You && member.Path != nil {
				return true
			}
		}
		return false
	})
	var state SessionState
	if err := json.Unmarshal(mustJSON(event.Data), &state); err != nil {
		t.Fatal(err)
	}
	if len(state.Members) != 2 {
		t.Fatal("path event lost the roster")
	}
}
