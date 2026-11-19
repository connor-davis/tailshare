package codes

import (
	"context"
	"io"
	"os"
	"testing"
	"time"

	"github.com/tailscale/tailcat"
	"tailscale.com/tailcfg"
)

func TestParse(t *testing.T) {
	for in, want := range map[string]Code{
		"7K3-Q9P":   "7K3Q9P",
		" 7k3 q9p ": "7K3Q9P",
		"OIL-abc":   "011ABC", // look-alikes fold to digits
	} {
		got, err := Parse(in)
		if err != nil || got != want {
			t.Errorf("Parse(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "7K3Q9", "7K3Q9PX", "7K3-Q9U"} {
		if _, err := Parse(bad); err == nil {
			t.Errorf("Parse(%q) accepted a bad code", bad)
		}
	}
	if c := New(); len(c) != Length {
		t.Errorf("New() = %q", c)
	} else if _, err := Parse(c.String()); err != nil {
		t.Errorf("Parse(New()) = %v", err)
	}
}

func TestDeriveIsStable(t *testing.T) {
	a, b, other := Derive("7K3Q9P"), Derive("7K3Q9P"), Derive("7K3Q9Q")
	if !a.Node.Equal(b.Node) || a.PSK != b.PSK {
		t.Fatal("same code gave different keys")
	}
	if a.Node.Equal(other.Node) || a.PSK == other.PSK {
		t.Fatal("different codes gave the same keys")
	}
	first, second := Addr("7K3Q9P", 303), Addr("7K3Q9P", 303)
	if first != second {
		t.Fatal("same code gave different addresses")
	}
}

// TestSeededKeysConnect is the seeded-keys spike: a host listens with keys
// derived from a code, and a joiner that knows only the code connects over
// Tailcat's free relays. It needs the internet, so it runs only when
// TAILSHARE_NET=1.
func TestSeededKeysConnect(t *testing.T) {
	if os.Getenv("TAILSHARE_NET") != "1" {
		t.Skip("set TAILSHARE_NET=1 to run the live relay test")
	}
	const region tailcfg.DERPRegionID = 303 // Frankfurt
	code := New()
	keys := Derive(code)

	ctx, cancel := context.WithTimeout(t.Context(), 60*time.Second)
	defer cancel()

	host := &tailcat.Server{Key: keys.Node, PresharedKey: keys.PSK, RegionID: region, Logf: t.Logf}
	defer host.Close()
	ln, err := host.Listen(ctx, "tcp", ":80")
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		io.WriteString(c, "hello from "+code.String())
		c.Close()
	}()

	joiner := tailcat.NewClient(Addr(code, region))
	joiner.Logf = t.Logf
	defer joiner.Close()
	conn, err := joiner.DialTCPPort(ctx, 80)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	got, err := io.ReadAll(conn)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "hello from "+code.String() {
		t.Fatalf("got %q", got)
	}
}
