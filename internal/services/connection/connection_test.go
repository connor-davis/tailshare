package connection

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
	"tailscale.com/net/netcheck"
	"tailscale.com/tailcfg"
	"tailscale.com/types/opt"
)

func TestMain(tests *testing.M) { tailcattest.Init(); os.Exit(tests.Run()) }

func TestReportHints(t *testing.T) {
	for _, test := range []struct {
		name    string
		report  *netcheck.Report
		nearest string
		portal  string
		hint    string
	}{
		{"udp blocked", &netcheck.Report{}, "", "unknown", "UDP may be blocked"},
		{"portal", &netcheck.Report{UDP: true, CaptivePortal: opt.Bool("true")}, "", "true", "sign-in"},
		{"nearest measured", &netcheck.Report{
			UDP: true, IPv4CanSend: true, IPv6CanSend: true, PreferredDERP: 301,
			RegionLatency: netcheck.RegionLatency{301: time.Second, 303: 10 * time.Millisecond, 999: time.Nanosecond},
		}, "FRA", "unknown", "direct path also depends"},
		{"negative portal stays unknown", &netcheck.Report{UDP: true, CaptivePortal: opt.Bool("false")}, "", "unknown", "No relay responded"},
	} {
		t.Run(test.name, func(t *testing.T) {
			got := resultFromReport(test.report)
			if got.Nearest != test.nearest || got.CaptivePortal != test.portal || len(got.Regions) != 4 {
				t.Fatalf("unexpected result: %+v", got)
			}
			if !strings.Contains(strings.Join(got.Hints, " "), test.hint) {
				t.Fatalf("missing hint %q: %+v", test.hint, got)
			}
			if got.IPv4 != test.report.IPv4CanSend || got.IPv6 != test.report.IPv6CanSend {
				t.Fatal("IP facts were changed")
			}
		})
	}
}

func TestConnectionOffline(t *testing.T) {
	relay := tailcattest.LocalDERP(t)
	region := relay.Regions[tailcattest.RegionID]
	region.RegionID, region.RegionCode = 303, "fra"
	for _, node := range region.Nodes {
		node.RegionID = 303
	}
	relay.Regions = map[tailcfg.DERPRegionID]*tailcfg.DERPRegion{303: region}
	url := tailcattest.ServeMap(t, relay)
	got, err := Test(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	if !got.UDP || got.Nearest != "FRA" || got.Regions[2].Milliseconds == nil {
		t.Fatalf("local relay not observed: %+v", got)
	}
}
