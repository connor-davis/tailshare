package session

import (
	"context"
	"errors"
	"net"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/services/peer"
)

func TestLeaveClosesOnlyThatLink(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	second := connectJoiner(t, host, code, options)
	third := connectJoiner(t, host, code, options)
	outgoing, incoming := dataPair(t, third, host)
	control, _ := host.Control(second.mesh.Self().ID)
	subscription := control.Subscribe()
	defer subscription.Close()
	if err := second.Leave(); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-subscription.Events:
		if event.Kind != peer.EventShare || event.Method != peer.MethodShareLeave {
			t.Fatal("leave event missing")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("leave event not delivered")
	}
	waitState(t, host, func() bool { return len(host.Members()) == 2 })
	waitState(t, third, func() bool { return len(third.Members()) == 2 })
	exchange(t, outgoing, incoming, "survived leave")
	select {
	case <-second.Done():
	default:
		t.Fatal("leaver remains open")
	}
}

func TestShareClosesAtOne(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	joiner := connectJoiner(t, host, code, options)
	_ = joiner.Leave()
	select {
	case <-host.Done():
	case <-time.After(3 * time.Second):
		t.Fatal("share survived alone")
	}
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	if receiveJoin(t, startMember(t, ctx, code, options)).err == nil {
		t.Fatal("closed code accepted")
	}
}

func TestExpiryStopsAtFirstAllow(t *testing.T) {
	options := localSettings(t)
	options.expiry = 2 * time.Second
	host, code := startHost(t, options)
	_ = connectJoiner(t, host, code, options)
	timer := time.NewTimer(options.expiry)
	defer timer.Stop()
	select {
	case <-host.Done():
		t.Fatal("expiry survived Allow")
	case <-timer.C:
	}
	second := connectJoiner(t, host, code, options)
	outgoing, incoming := dataPair(t, second, host)
	exchange(t, outgoing, incoming, "code stayed open")
}

func TestTakeoverCleanLeave(t *testing.T) {
	testTakeover(t, true)
}

func TestTakeoverAfterLostLinkWaitsGrace(t *testing.T) {
	testTakeover(t, false)
}

func testTakeover(t *testing.T, clean bool) {
	t.Helper()
	options := localSettings(t)
	options.lostGrace = 300 * time.Millisecond
	host, code := startHost(t, options)
	second := connectJoiner(t, host, code, options)
	third := connectJoiner(t, host, code, options)
	secondControl, _ := second.Control(host.mesh.Self().ID)
	thirdControl, _ := third.Control(host.mesh.Self().ID)
	started := time.Now()
	if clean {
		_ = host.Leave()
	} else {
		_ = host.Close()

		// Model transport loss on both survivors. Destroying a WireGuard server
		// can discard TCP's final packet, so EOF delivery is not a reliable clock.
		_ = secondControl.Close()
		_ = thirdControl.Close()
	}
	t.Log("waiting for survivor to observe host loss")
	waitState(t, second, func() bool { return len(second.Members()) == 2 })
	waitState(t, third, func() bool { return len(third.Members()) == 2 })
	if !clean {
		second.mu.Lock()
		running := second.server != nil
		second.mu.Unlock()
		if running && time.Since(started) < options.lostGrace {
			t.Fatal("takeover skipped lost-link grace")
		}
	}
	t.Log("waiting for takeover code server")
	waitState(t, second, func() bool {
		second.mu.Lock()
		defer second.mu.Unlock()
		return second.server != nil
	})
	if !clean && time.Since(started) < options.lostGrace {
		t.Fatal("takeover code server started before the lost-link grace")
	}
	third.mu.Lock()
	running := third.server != nil
	third.mu.Unlock()
	if running {
		t.Fatal("higher-order survivor took over")
	}
	t.Log("joining through the takeover code server")
	fourth := connectJoiner(t, second, code, options)
	outgoing, incoming := dataPair(t, fourth, third)
	exchange(t, outgoing, incoming, "same code after takeover")
}

func TestCloseCleansUp(t *testing.T) {
	options := localSettings(t)
	host, code := startHost(t, options)
	joiner := connectJoiner(t, host, code, options)
	tunnel, _ := host.Tunnel(joiner.mesh.Self().ID)
	for _, session := range []*Session{joiner, host} {
		if err := session.Close(); err != nil {
			t.Fatal(err)
		}
		if err := session.Close(); err != nil {
			t.Fatal(err)
		}
		if len(session.Members()) != 0 {
			t.Fatal("closed members retained")
		}
		select {
		case <-session.Done():
		default:
			t.Fatal("Done remains open")
		}
	}
	if _, err := tunnel.Accept(); !errors.Is(err, net.ErrClosed) {
		t.Fatalf("Accept after close: %v", err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	if receiveJoin(t, startMember(t, ctx, code, options)).err == nil {
		t.Fatal("closed code accepted")
	}
}

func TestPendingAndDenyDoNotStopExpiry(t *testing.T) {
	for _, deny := range []bool{false, true} {
		t.Run(map[bool]string{false: "pending", true: "deny"}[deny], func(t *testing.T) {
			options := localSettings(t)
			options.expiry = 2 * time.Second
			host, code := startHost(t, options)
			ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
			defer cancel()
			results := startMember(t, ctx, code, options)
			pending := waitPending(t, host)
			if deny {
				if err := host.Deny(pending.ID); err != nil {
					t.Fatal(err)
				}
				assertRemoteCode(t, receiveJoin(t, results).err, peer.CodeJoinDenied)
			}
			select {
			case <-host.Done():
			case <-ctx.Done():
				t.Fatal("unused code expiry stopped without Allow")
			}
			if !deny && receiveJoin(t, results).err == nil {
				t.Fatal("expired pending join succeeded")
			}
		})
	}
}

func TestLostPairDropsBothEnds(t *testing.T) {
	options := localSettings(t)
	options.lostGrace = 10 * time.Second
	host, code := startHost(t, options)
	second := connectJoiner(t, host, code, options)
	third := connectJoiner(t, host, code, options)
	control, _ := second.Control(host.mesh.Self().ID)
	_ = control.Close()
	waitState(t, host, func() bool { return len(host.Members()) == 2 })
	waitState(t, second, func() bool { return len(second.Members()) == 2 })
	if len(third.Members()) != 3 {
		t.Fatal("unrelated member unexpectedly resynchronized its roster")
	}
	outgoing, incoming := dataPair(t, third, host)
	exchange(t, outgoing, incoming, "unrelated link survives")
}
