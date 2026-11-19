// Package tailcattest is the local relay every networked test uses, so tests
// run offline and never touch the machine's gateway or Tailcat's real relays.
package tailcattest

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"tailscale.com/envknob"
	"tailscale.com/net/netcheck"
	"tailscale.com/syncs"
	"tailscale.com/tailcfg"
	"tailscale.com/tstest/integration"
)

// RegionID is the one region a LocalDERP map holds.
const RegionID tailcfg.DERPRegionID = 1

// Init stops engines from probing the machine's gateway and public captive
// portal endpoints. Call it from each package's TestMain: TestMain itself
// cannot be shared between packages.
func Init() {
	envknob.Setenv("IN_TS_TEST", "true")
	netcheck.HookStartCaptivePortalDetection.SetForTest(func(
		ctx context.Context,
		client *netcheck.Client,
		derpMap *tailcfg.DERPMap,
		preferredDERP tailcfg.DERPRegionID,
		setCaptivePortal func(bool),
	) (<-chan struct{}, func()) {
		return syncs.ClosedChan(), func() {}
	})
}

// LocalDERP starts a relay and STUN server on 127.0.0.1 for the test and
// returns its map. The relay is region RegionID.
func LocalDERP(t testing.TB) *tailcfg.DERPMap {
	t.Helper()

	return integration.RunDERPAndSTUN(t, t.Logf, "127.0.0.1")
}

// ServeMap serves a relay map as JSON, the way the real map URL does, and
// returns its URL. It lets the public Host and Join, which only take a map
// URL, run against the local relay with no test-only code in production.
func ServeMap(t testing.TB, derpMap *tailcfg.DERPMap) string {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(derpMap)
	}))
	t.Cleanup(server.Close)

	return server.URL
}
