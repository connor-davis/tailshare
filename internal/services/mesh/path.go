package mesh

import (
	"context"
	"strings"

	"github.com/connor-davis/tailshare/internal/services/connection"
	"tailscale.com/ipn/ipnstate"
)

// Path is the last observed path to one room member. Unknown means no usable observation.
type Path struct {
	Kind   string `json:"kind"`
	Region string `json:"region,omitempty"`
}

// Path observes the member's authenticated mesh link, never its offered display name.
func (mesh *Mesh) Path(ctx context.Context, id string) Path {
	mesh.mu.Lock()
	if mesh.closed {
		mesh.mu.Unlock()
		return Path{Kind: "unknown"}
	}
	link := mesh.outgoing[id]
	var incoming *ipnstate.PeerStatus
	if link == nil {
		status := mesh.server.Status()
		for public, memberID := range mesh.expected {
			if memberID == id {
				incoming = status.Peer[public]
				break
			}
		}
	}
	mesh.mu.Unlock()
	if link != nil {
		result, err := link.client.DiscoPing(ctx)
		if err != nil {
			return Path{Kind: "unknown"}
		}
		return pathFromPing(result)
	}
	return pathFromPeerStatus(incoming)
}

func pathFromPeerStatus(status *ipnstate.PeerStatus) Path {
	if status != nil {
		if status.CurAddr != "" {
			return Path{Kind: "direct"}
		}
		if status.Relay != "" {
			return Path{Kind: "relay", Region: strings.ToUpper(status.Relay)}
		}
	}
	return Path{Kind: "unknown"}
}

func pathFromPing(result *ipnstate.PingResult) Path {
	if result != nil && result.Err == "" {
		if result.Endpoint != "" {
			return Path{Kind: "direct"}
		}
		if result.DERPRegionCode != "" {
			return Path{Kind: "relay", Region: strings.ToUpper(result.DERPRegionCode)}
		}
		if result.DERPRegionID != 0 {
			return Path{Kind: "relay", Region: connection.RegionCode(result.DERPRegionID)}
		}
	}
	return Path{Kind: "unknown"}
}
