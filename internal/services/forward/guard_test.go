package forward

import (
	"errors"
	"strings"
	"testing"

	"github.com/connor-davis/tailshare/internal/services/peer"
)

func TestShareValidation(t *testing.T) {
	forwards := New(nil)
	defer forwards.Close()

	// No room yet, so even a valid share has nowhere to go.
	if _, err := forwards.Share(8080, "ok"); !errors.Is(err, ErrNotConnected) {
		t.Fatalf("share without a room: %v", err)
	}

	for _, test := range []struct {
		port  int
		label string
	}{
		{0, "x"}, {65536, "x"}, {-1, "x"}, {80, ""}, {80, "   "}, {80, strings.Repeat("a", 65)},
		{80, "bad\nlabel"}, {80, "\xff"},
	} {
		if _, err := forwards.Share(test.port, test.label); !errors.Is(err, ErrInvalid) {
			t.Fatalf("%+v was accepted: %v", test, err)
		}
	}
}

func TestListValidation(t *testing.T) {
	good := peer.ForwardShare{ID: "0123456789abcdef", Label: "Web", Port: 80}
	if !validList(peer.ForwardList{Shares: []peer.ForwardShare{good}}) {
		t.Fatal("a good list was refused")
	}

	bad := []peer.ForwardShare{
		{ID: "short", Label: "Web", Port: 80},
		{ID: "0123456789ABCDEF", Label: "Web", Port: 80},
		{ID: good.ID, Label: "Web", Port: 0},
		{ID: good.ID, Label: "Web", Port: 70000},
		{ID: good.ID, Label: "", Port: 80},
		{ID: good.ID, Label: " padded ", Port: 80},
	}
	for _, share := range bad {
		if validList(peer.ForwardList{Shares: []peer.ForwardShare{share}}) {
			t.Fatalf("%+v was accepted", share)
		}
	}
	if validList(peer.ForwardList{Shares: []peer.ForwardShare{good, good}}) {
		t.Fatal("a repeated ID was accepted")
	}

	many := make([]peer.ForwardShare, peer.MaxForwardsPerMember+1)
	if validList(peer.ForwardList{Shares: many}) {
		t.Fatal("too many shares were accepted")
	}
}
