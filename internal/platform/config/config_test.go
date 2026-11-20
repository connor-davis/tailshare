package config

import "testing"

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

func TestRoomAndMainSettings(t *testing.T) {
	t.Setenv("TAILSHARE_ROOMS_DIR", "C:/App/rooms")
	t.Setenv("TAILSHARE_MAIN_TOKEN", "secret")
	cfg, err := Load()
	if err != nil || cfg.RoomsDir != "C:/App/rooms" || cfg.MainToken != "secret" {
		t.Fatalf("settings not loaded: %v", err)
	}
}
