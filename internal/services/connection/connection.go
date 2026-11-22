// Package connection reports relay reachability without claiming to diagnose a firewall.
package connection

import (
	"context"
	"time"

	"github.com/tailscale/tailcat"
	"tailscale.com/net/netcheck"
	"tailscale.com/net/netmon"
	"tailscale.com/net/netns"
	"tailscale.com/tailcfg"
	"tailscale.com/types/logger"
)

// FreeMap keeps only Tailcat's four free relays, including in a custom test map.
func FreeMap(ctx context.Context, mapURL string) (*tailcfg.DERPMap, error) {
	var options []any
	if mapURL != "" {
		options = append(options, tailcat.DERPMapURL(mapURL))
	}
	source, err := tailcat.FetchDERPMap(ctx, options...)
	if err != nil {
		return nil, err
	}
	result := &tailcfg.DERPMap{Regions: make(map[tailcfg.DERPRegionID]*tailcfg.DERPRegion)}
	for _, id := range []tailcfg.DERPRegionID{301, 302, 303, 304} {
		if region := source.Regions[id]; region != nil {
			result.Regions[id] = region
		}
	}
	return result, nil
}

// Latency is one region's measured round trip, absent when the probe did not respond.
type Latency struct {
	Region       string `json:"region"`
	Milliseconds *int64 `json:"milliseconds"`
}

// Result contains safe observations only; public addresses never reach the screen.
type Result struct {
	UDP           bool      `json:"udp"`
	IPv4          bool      `json:"ipv4"`
	IPv6          bool      `json:"ipv6"`
	Regions       []Latency `json:"regions"`
	Nearest       string    `json:"nearest,omitempty"`
	CaptivePortal string    `json:"captivePortal"`
	Hints         []string  `json:"hints"`
}

// Test runs one bounded netcheck against the same relay map used by sessions.
func Test(ctx context.Context, mapURL string) (Result, error) {
	bounded, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	relayMap, err := FreeMap(bounded, mapURL)
	if err != nil {
		return Result{}, err
	}
	netns.SetEnabled(false)
	client := &netcheck.Client{NetMon: netmon.NewStatic(), Logf: logger.Discard}
	if err := client.Standalone(bounded, ":0"); err != nil {
		return Result{}, err
	}
	report, err := client.GetReport(bounded, relayMap, &netcheck.GetReportOpts{})
	if err != nil {
		return Result{}, err
	}
	return resultFromReport(report), nil
}

func resultFromReport(report *netcheck.Report) Result {
	result := Result{
		UDP: report.UDP, IPv4: report.IPv4CanSend, IPv6: report.IPv6CanSend,
		CaptivePortal: "unknown", Regions: []Latency{}, Hints: []string{},
	}
	best := time.Duration(1<<63 - 1)
	for _, id := range []tailcfg.DERPRegionID{301, 302, 303, 304} {
		entry := Latency{Region: RegionCode(id)}
		if latency, ok := report.RegionLatency[id]; ok {
			milliseconds := latency.Milliseconds()
			entry.Milliseconds = &milliseconds
			if latency < best {
				best, result.Nearest = latency, entry.Region
			}
		}
		result.Regions = append(result.Regions, entry)
	}
	if !report.UDP {
		result.Hints = append(result.Hints, "UDP may be blocked, so files go through a relay.")
	}
	if portal, known := report.CaptivePortal.Get(); known && portal {
		result.CaptivePortal = "true"
		result.Hints = append(result.Hints, "This network may need a sign-in in your browser.")
	}
	if result.Nearest == "" {
		result.Hints = append(result.Hints, "No relay responded. Check your connection and try again.")
	}
	result.Hints = append(
		result.Hints,
		"This test checks relay reachability. A direct path also depends on the other computer's network.",
	)
	return result
}

// RegionCode is the short display name of a free region, or empty for an unknown region.
func RegionCode(id tailcfg.DERPRegionID) string {
	return map[tailcfg.DERPRegionID]string{301: "NYC", 302: "SFO", 303: "FRA", 304: "TOK"}[id]
}
