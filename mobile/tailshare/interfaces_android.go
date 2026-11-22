//go:build android && cgo

package tailshare

import (
	"errors"
	"net"
	"net/netip"
	"time"

	"tailscale.com/net/netmon"
)

// Android denies apps the netlink socket, so net.Interfaces fails and Tailcat's server
// cannot start. Tailscale's androidbin fallback skips cgo builds (it expects the Tailscale
// app's Java getter), and gomobile builds use cgo, so this registers the same fallback.
// It only runs when net.Interfaces fails.
func init() {
	netmon.HookInterfacesFallback.Set(syntheticInterfaces)
}

// syntheticInterfaces reports one interface whose addresses come from routing an outbound
// UDP socket. Connecting a UDP socket sends no packets. ponytail: one interface only, like
// androidbin; a Java getter would see every network if direct paths ever need it.
func syntheticInterfaces() ([]netmon.Interface, error) {
	var addrs []net.Addr
	if ip, ok := outboundIP("udp4", "8.8.8.8:53"); ok {
		addrs = append(addrs, &net.IPNet{IP: ip.AsSlice(), Mask: net.CIDRMask(32, 32)})
	}
	if ip, ok := outboundIP("udp6", "[2001:4860:4860::8888]:53"); ok {
		addrs = append(addrs, &net.IPNet{IP: ip.AsSlice(), Mask: net.CIDRMask(128, 128)})
	}
	if len(addrs) == 0 {
		return nil, errors.New("no network route found")
	}

	return []netmon.Interface{{
		Interface: &net.Interface{MTU: 1500, Name: "android", Flags: net.FlagUp | net.FlagRunning},
		AltAddrs:  addrs,
	}}, nil
}

// outboundIP is the local address the kernel would use to reach addr.
func outboundIP(network, addr string) (netip.Addr, bool) {
	dialer := net.Dialer{Timeout: 2 * time.Second}
	conn, err := dialer.Dial(network, addr)
	if err != nil {
		return netip.Addr{}, false
	}
	defer conn.Close()

	local, ok := conn.LocalAddr().(*net.UDPAddr)
	if !ok {
		return netip.Addr{}, false
	}
	ip, ok := netip.AddrFromSlice(local.IP)
	if !ok {
		return netip.Addr{}, false
	}
	ip = ip.Unmap()
	if ip.IsLoopback() || ip.IsUnspecified() {
		return netip.Addr{}, false
	}

	return ip, true
}
