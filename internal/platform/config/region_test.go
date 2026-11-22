package config

import "testing"

func TestRelayPreference(t *testing.T) {
	for _, value := range []string{"301", "302", "303", "304", "nearest"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("TAILSHARE_REGION", value)
			cfg, err := Load()
			if err != nil {
				t.Fatal(err)
			}
			if cfg.Nearest != (value == "nearest") || cfg.Region < 301 || cfg.Region > 304 {
				t.Fatalf("bad preference: %+v", cfg)
			}
		})
	}
	for _, value := range []string{"0", "305", "-1", "", "FRA"} {
		t.Setenv("TAILSHARE_REGION", value)
		if _, err := Load(); err == nil {
			t.Fatalf("accepted %q", value)
		}
	}
}
