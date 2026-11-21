package api

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/transfer"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

func TestAuditChatSubscriptionRecovers(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	remote := f.connectPipe()
	local := f.server.peer
	subscription := local.Subscribe()
	for range 100 {
		if _, err := remote.SendChat(t.Context(), "burst"); err != nil {
			t.Fatal(err)
		}
	}
	go f.server.forwardChat(local, subscription)
	eventually(t, "overflow recovery", func() bool {
		f.server.hub.mu.Lock()
		defer f.server.hub.mu.Unlock()
		return f.server.hub.seq >= 100
	})
	live := f.server.hub.add(func() any { return nil }, func() {})
	defer f.server.hub.remove(live)
	<-live.send
	if _, err := remote.SendChat(t.Context(), "later"); err != nil {
		t.Fatal(err)
	}
	select {
	case raw := <-live.send:
		var event struct {
			Type string
			Data struct{ Text string }
		}
		if json.Unmarshal(raw, &event) != nil || event.Type != "chat.message" || event.Data.Text != "later" {
			t.Fatalf("lost later chat: %s", raw)
		}
	case <-time.After(time.Second):
		t.Fatal("chat forwarding stopped after overflow")
	}
}

func TestAuditDoubleDotDestinationAccepted(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	f.chooseFolder()
	manager := transfer.New(f.server.root)
	defer manager.Close()
	manager.SetDownloadRoot(f.server.root)
	f.server.transfers = newManagedTransfers(manager)
	f.server.phase = phaseConnected
	f.send("POST", "/api/transfers", TransferRequest{
		Direction: "download", Source: "report..final.pdf", Destination: "a..b.txt",
	}).expect(t, 202, "")
}

func TestAuditNonASCIIHostnameTruncation(t *testing.T) {
	name := truncateName(strings.Repeat("é", 70))
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) != 64 {
		t.Fatalf("invalid hostname: %q", name)
	}
}

func TestAuditTransportErrorsStayPrivate(t *testing.T) {
	if result := connectError(net.ErrClosed); result.Message != "Could not reach the other computer." {
		t.Fatalf("raw error exposed: %+v", result)
	}
	f := newFixture(t, config.Config{}, nil)
	f.connectPipe()
	result := toAppError(chatError(f.server.peer, net.ErrClosed))
	if result.Message != "Could not reach the other computer." {
		t.Fatalf("raw chat error exposed: %+v", result)
	}
}

func TestAuditDownloadRootsDeduplicated(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	folder := t.TempDir()
	for range 50 {
		f.send("PUT", "/api/downloads", map[string]string{"folder": folder}, mainHeader).expect(t, 200, "")
	}
	if len(f.server.downloadRoots) != 1 {
		t.Fatalf("retained %d duplicate handles", len(f.server.downloadRoots))
	}
	previous := f.server.downloadRoot
	f.send("PUT", "/api/downloads", map[string]string{"folder": t.TempDir()}, mainHeader).expect(t, 200, "")
	if len(f.server.downloadRoots) != 1 {
		t.Fatal("unpinned root retained")
	}
	if _, err := previous.Stat(""); err == nil {
		t.Fatal("unpinned root remains open")
	}
}

func TestAuditMainTokenValidation(t *testing.T) {
	for _, token := range []string{"short", strings.Repeat("z", 64), testToken, strings.ToUpper(testToken)} {
		if server, err := New(config.Config{Token: testToken, MainToken: token}); err == nil {
			server.cancel()
			t.Fatalf("unsafe main token accepted: %q", token)
		}
	}
}

func TestAuditRemoveMemberRoute(t *testing.T) {
	relay := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: relay}
	host, second, third := newFixture(t, cfg, nil), newFixture(t, cfg, nil), newFixture(t, cfg, nil)
	hosted := host.send("POST", "/api/session/host", map[string]string{"displayName": "Host"})
	hosted.expect(t, 201, "")
	code := hosted.Body["code"].(string)
	joinWithApproval(t, host, second, code).expect(t, 200, "")
	joinWithApproval(t, host, third, code).expect(t, 200, "")
	state := host.server.sessionState()
	if len(state.Members) != 3 || state.Members[2].Fingerprint == "" {
		t.Fatal("roster lacks fingerprints")
	}
	var answer peer.TransferAccept
	err := third.server.peer.Call(t.Context(), peer.MethodTransferOffer, peer.TransferOffer{
		TransferID: rand.Text(), Path: "file", Direction: peer.DirectionUpload, Size: 0,
		SHA256: strings.Repeat("a", 64),
	}, &answer)
	var remote *peer.RemoteError
	if !errors.As(err, &remote) || remote.Code != peer.CodeDenied {
		t.Fatalf("third member transfer not denied: %v", err)
	}
	if len(host.server.manager.Snapshot()) != 0 {
		t.Fatal("third member occupied transfer slot")
	}
	id := state.Members[2].ID
	route := "/api/session/members/" + url.PathEscape(id)
	second.send("DELETE", route, nil).expect(t, 409, "not_admitter")
	host.send("DELETE", route, nil).expect(t, 200, "")
	if len(host.server.sess.Members()) != 2 {
		t.Fatal("API retained removed member")
	}
	attachedID := state.Members[1].ID
	host.send("DELETE", "/api/session/members/"+url.PathEscape(attachedID), nil).expect(t, 200, "")
	eventually(t, "host waits after attached member removal", func() bool {
		host.server.mu.Lock()
		defer host.server.mu.Unlock()
		return host.server.phase == phaseHosting && host.server.peer == nil
	})
	fourth := newFixture(t, cfg, nil)
	joinWithApproval(t, host, fourth, code).expect(t, 200, "")
	// A replacement manager must receive requests from already installed control wrappers.
	err = fourth.server.peer.Call(t.Context(), peer.MethodTransferOffer, peer.TransferOffer{
		TransferID: rand.Text(), Path: "../escape", Direction: peer.DirectionUpload,
	}, &answer)
	if err != nil || answer.Accepted {
		t.Fatalf("replacement transfer handler: %+v %v", answer, err)
	}
}
