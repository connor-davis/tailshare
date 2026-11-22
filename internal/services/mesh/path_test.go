package mesh

import (
	"tailscale.com/ipn/ipnstate"
	"testing"
)

func TestPathFromPeerStatus(t *testing.T) {
	for _, test := range []struct {
		name   string
		status *ipnstate.PeerStatus
		want   Path
	}{
		{"missing", nil, Path{Kind: "unknown"}},
		{"empty", &ipnstate.PeerStatus{}, Path{Kind: "unknown"}},
		{"direct wins", &ipnstate.PeerStatus{CurAddr: "127.0.0.1:1234", Relay: "fra"}, Path{Kind: "direct"}},
		{"relay", &ipnstate.PeerStatus{Relay: "fra"}, Path{Kind: "relay", Region: "FRA"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := pathFromPeerStatus(test.status); got != test.want {
				t.Fatalf("got %+v, want %+v", got, test.want)
			}
		})
	}
}

func TestPathFromPing(t *testing.T) {
	for _, test := range []struct {
		name   string
		result *ipnstate.PingResult
		want   Path
	}{
		{"missing", nil, Path{Kind: "unknown"}},
		{"empty", &ipnstate.PingResult{}, Path{Kind: "unknown"}},
		{"failed", &ipnstate.PingResult{Err: "timeout", DERPRegionID: 303}, Path{Kind: "unknown"}},
		{"direct wins", &ipnstate.PingResult{Endpoint: "127.0.0.1:1234", DERPRegionID: 303}, Path{Kind: "direct"}},
		{"code", &ipnstate.PingResult{DERPRegionCode: "tok"}, Path{Kind: "relay", Region: "TOK"}},
		{"id", &ipnstate.PingResult{DERPRegionID: 303}, Path{Kind: "relay", Region: "FRA"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := pathFromPing(test.result); got != test.want {
				t.Fatalf("got %+v, want %+v", got, test.want)
			}
		})
	}
}
