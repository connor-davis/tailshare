package session

import (
	"context"
	"strings"
	"testing"
	"time"

	"tailscale.com/types/key"
)

func newIdentity() (key.NodePrivate, string) {
	private := key.NewNode()
	return private, private.Public().String()
}

func TestTrustedSetValidates(t *testing.T) {
	_, good := newIdentity()
	trusted := NewTrusted()
	if err := trusted.Set([]string{good}); err != nil || !trusted.Has(good) {
		t.Fatalf("good key: %v", err)
	}

	tooMany := make([]string, MaxTrusted+1)
	for i := range tooMany {
		_, tooMany[i] = newIdentity()
	}
	for name, bad := range map[string][]string{
		"junk":      {"not a key"},
		"empty":     {""},
		"upper":     {strings.ToUpper(good)},
		"private":   {"privkey:" + strings.Repeat("ab", 32)},
		"zero":      {"nodekey:" + strings.Repeat("00", 32)},
		"too many":  tooMany,
		"mixed bad": {good, "nodekey:xyz"},
	} {
		if err := trusted.Set(bad); err == nil {
			t.Fatalf("%s was accepted", name)
		}
		// A refused list must leave the old one alone.
		if !trusted.Has(good) {
			t.Fatalf("%s changed the saved list", name)
		}
	}

	if err := trusted.Set(tooMany[:MaxTrusted]); err != nil {
		t.Fatalf("exactly %d keys refused: %v", MaxTrusted, err)
	}
	if trusted.Has(good) {
		t.Fatal("old key survived a replace")
	}

	var none *Trusted
	if none.Has(good) {
		t.Fatal("nil list trusted someone")
	}
}

// joinerWith starts a joiner that always uses this key, like the app's saved identity.
func joinerWith(t *testing.T, code string, options settings, private key.NodePrivate) <-chan joinResult {
	t.Helper()
	options.identity = private
	options.options.Trusted = nil

	results := make(chan joinResult, 1)
	ctx, cancel := context.WithTimeout(t.Context(), 40*time.Second)
	t.Cleanup(cancel)
	go func() {
		session, err := join(ctx, code, options)
		results <- joinResult{session, err}
	}()

	return results
}

func TestTrustedKeySkipsPrompt(t *testing.T) {
	options := localSettings(t)
	options.options.Trusted = NewTrusted()
	private, public := newIdentity()
	if err := options.options.Trusted.Set([]string{public}); err != nil {
		t.Fatal(err)
	}
	host, code := startHost(t, options)

	// Nobody clicks Allow: the join must finish on its own.
	result := receiveJoin(t, joinerWith(t, code.String(), options, private))
	if result.err != nil {
		t.Fatal(result.err)
	}
	if _, waiting := host.Pending(); waiting {
		t.Fatal("a trusted join still asked for Allow")
	}

	id := result.session.mesh.Self().ID
	waitState(t, host, func() bool { _, ok := host.Control(id); return ok })
	if len(host.Members()) != 2 {
		t.Fatalf("members = %d, want 2", len(host.Members()))
	}
}

func TestUntrustedAndWrongKeyStillPrompt(t *testing.T) {
	options := localSettings(t)
	options.options.Trusted = NewTrusted()
	_, other := newIdentity()
	if err := options.options.Trusted.Set([]string{other}); err != nil {
		t.Fatal(err)
	}
	host, code := startHost(t, options)

	private, public := newIdentity()
	results := joinerWith(t, code.String(), options, private)
	pending := waitPending(t, host)

	// The prompt names the exact authenticated key, not a name or fingerprint.
	got, fingerprint, err := host.PendingKey(pending.ID)
	if err != nil || got != public || fingerprint != pending.Fingerprint {
		t.Fatalf("PendingKey = %q %q %v, want %q", got, fingerprint, err, public)
	}
	if _, _, err := host.PendingKey(pending.ID + 1); err == nil {
		t.Fatal("a stale prompt ID gave out a key")
	}

	if err := host.Allow(pending.ID); err != nil {
		t.Fatal(err)
	}
	if result := receiveJoin(t, results); result.err != nil {
		t.Fatal(result.err)
	}
	if _, _, err := host.PendingKey(pending.ID); err == nil {
		t.Fatal("a settled prompt still gave out a key")
	}
}

func TestRevokeAppliesToNextJoin(t *testing.T) {
	options := localSettings(t)
	options.options.Trusted = NewTrusted()
	private, public := newIdentity()
	if err := options.options.Trusted.Set([]string{public}); err != nil {
		t.Fatal(err)
	}
	host, code := startHost(t, options)

	// The app sends the whole list again; an empty one revokes everyone.
	if err := options.options.Trusted.Set(nil); err != nil {
		t.Fatal(err)
	}

	joinerWith(t, code.String(), options, private)
	waitPending(t, host)
}

func TestJoinWithoutIdentityIsAStranger(t *testing.T) {
	options := localSettings(t)
	options.options.Trusted = NewTrusted()
	_, public := newIdentity()
	if err := options.options.Trusted.Set([]string{public}); err != nil {
		t.Fatal(err)
	}
	host, code := startHost(t, options)

	// No saved key means a random key per join, which is never on the list.
	options.options.Trusted = nil
	ctx, cancel := context.WithTimeout(t.Context(), 40*time.Second)
	defer cancel()
	startMember(t, ctx, code, options)

	pending := waitPending(t, host)
	got, _, err := host.PendingKey(pending.ID)
	if err != nil || got == public || !strings.HasPrefix(got, "nodekey:") {
		t.Fatalf("PendingKey = %q %v", got, err)
	}
}
