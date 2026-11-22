package config

import (
	"strings"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}

	if cfg.Region != 303 || cfg.Addr != "127.0.0.1:0" || cfg.Dev {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
}

func TestLoadRejectsBadRegion(t *testing.T) {
	t.Setenv("TAILSHARE_REGION", "frankfurt")

	if _, err := Load(); err == nil {
		t.Fatal("a non-numeric region was accepted")
	}
}

func TestIdentitySetting(t *testing.T) {
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if private, err := cfg.IdentityKey(); err != nil || !private.IsZero() {
		t.Fatalf("no identity should mean the zero key: %v", err)
	}

	secret := "privkey:" + strings.Repeat("ab", 32)
	t.Setenv("TAILSHARE_IDENTITY", secret)
	cfg, err = Load()
	if err != nil {
		t.Fatal(err)
	}
	if private, err := cfg.IdentityKey(); err != nil || private.IsZero() {
		t.Fatalf("a good identity was not read: %v", err)
	}

	for _, bad := range []string{"nope", "privkey:abc", "nodekey:" + strings.Repeat("ab", 32)} {
		t.Setenv("TAILSHARE_IDENTITY", bad)
		_, err := Load()
		if err == nil || strings.Contains(err.Error(), bad) {
			t.Fatalf("%q: error %v must exist and not repeat the secret", bad, err)
		}
	}
}

func TestRoomAndMainSettings(t *testing.T) {
	t.Setenv("TAILSHARE_ROOMS_DIR", "C:/App/rooms")
	t.Setenv("TAILSHARE_MAIN_TOKEN", "secret")
	cfg, err := Load()
	if err != nil || cfg.RoomsDir != "C:/App/rooms" || cfg.MainToken != "secret" {
		t.Fatalf("settings not loaded: %v", err)
	}
}
