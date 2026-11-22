package session

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
	"tailscale.com/tailcfg"
	"tailscale.com/types/key"
)

func TestRegionOrder(t *testing.T) {
	got := regionOrder(303)
	if !reflect.DeepEqual(got, []tailcfg.DERPRegionID{303, 301, 302, 304}) {
		t.Fatalf("wrong preference order: %v", got)
	}
}

func TestJoinDiscoversOtherRegion(t *testing.T) {
	relayMap := tailcattest.MultiRegion(t)
	options := localSettings(t)
	options.regionID, options.region, options.derpMap = 304, relayMap.Regions[304], relayMap
	host, code := startHost(t, options)
	options.regionID, options.region = 301, relayMap.Regions[301]
	joined := connectJoiner(t, host, code, options)
	if len(joined.Members()) != 2 {
		t.Fatal("wrong roster")
	}
	if host.settings.regionID != 304 || joined.settings.regionID != 301 {
		t.Fatal("bootstrap discovery changed the mesh region")
	}
	// The observation is sidecar-owned and eventually appears without renderer requests.
	waitState(t, joined, func() bool { return joined.Path(host.SelfID()) != nil })
}

func TestBootstrapFailureAndCancellation(t *testing.T) {
	relayMap := tailcattest.MultiRegion(t)
	options := settings{regionID: 303, derpMap: relayMap}
	for _, alreadyCancelled := range []bool{false, true} {
		ctx, cancel := context.WithTimeout(t.Context(), 500*time.Millisecond)
		if alreadyCancelled {
			cancel()
		}
		started := time.Now()
		client, conn, err := raceBootstrap(ctx, codes.New(), key.NewNode(), options)
		cancel()
		if err == nil || client != nil || conn != nil {
			t.Fatal("unreachable host connected")
		}
		if time.Since(started) > 3*time.Second {
			t.Fatal("attempts multiplied the shared deadline")
		}
	}
}

func TestNearestHostRegion(t *testing.T) {
	relayMap := tailcattest.MultiRegion(t)
	url := tailcattest.ServeMap(t, relayMap)
	got := selectedRegion(t.Context(), config.Config{Nearest: true, DERPMapURL: url})
	if got < 301 || got > 304 {
		t.Fatalf("nearest not a free region: %v", got)
	}
	cancelled, cancel := context.WithCancel(t.Context())
	cancel()
	if got := selectedRegion(cancelled, config.Config{Nearest: true, DERPMapURL: url}); got != 303 {
		t.Fatalf("missing nearest fallback: %v", got)
	}
}

func TestBootstrapChoosesOnlyOneAdmission(t *testing.T) {
	relayMap := tailcattest.MultiRegion(t)
	code := codes.New()
	options := localSettings(t)
	options.options.Code = code
	options.regionID, options.region, options.derpMap = 301, relayMap.Regions[301], relayMap
	preferred, _ := startHost(t, options)
	options.regionID, options.region = 304, relayMap.Regions[304]
	other, _ := startHost(t, options)
	options.regionID, options.region = 301, relayMap.Regions[301]

	ctx, cancel := context.WithTimeout(t.Context(), 40*time.Second)
	defer cancel()
	result := startMember(t, ctx, code, options)
	for {
		if pending, ok := preferred.Pending(); ok {
			if err := preferred.Allow(pending.ID); err != nil {
				t.Fatal(err)
			}
			break
		}
		if pending, ok := other.Pending(); ok {
			if err := other.Allow(pending.ID); err != nil {
				t.Fatal(err)
			}
			break
		}
		select {
		case <-preferred.Changes():
		case <-other.Changes():
		case <-ctx.Done():
			t.Fatal("neither bootstrap reached admission")
		}
	}
	joined := receiveJoin(t, result)
	if joined.err != nil {
		t.Fatal(joined.err)
	}
	if len(joined.session.Members()) != 2 {
		t.Fatal("winner did not join")
	}
	preferred.mu.Lock()
	count := preferred.nextJoin
	preferred.mu.Unlock()
	other.mu.Lock()
	count += other.nextJoin
	other.mu.Unlock()
	if count != 1 {
		t.Fatalf("%d bootstrap connections proceeded to admission", count)
	}
}
