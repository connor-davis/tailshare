// Package config reads every setting from environment variables. The list
// in EnvVars is the single source: usage text and docs follow it.
package config

import (
	"fmt"
	"os"
	"strconv"

	"tailscale.com/tailcfg"
)

// Version is set at build time with -ldflags "-X .../config.Version=v1.2.3".
var Version = "dev"

// Config holds the settings for one run of the sidecar.
type Config struct {
	// Addr is where the local API listens. It must stay on loopback: only the
	// Electron app on this machine may talk to it.
	Addr string

	// Token is the per-launch secret the Electron app passes in. Every local
	// API call must carry it, so other programs on the machine can't drive us.
	Token string

	// Region is the Tailcat relay region both peers bootstrap through. It is
	// not secret and not part of the share code (see docs/security.md).
	Region tailcfg.DERPRegionID

	// DERPMapURL is where the relay list comes from. Empty means Tailcat's
	// free relays; set it to a self-hosted DERP map to use your own relay.
	DERPMapURL string

	// Dev turns on coloured, chatty logs.
	Dev bool
}

// EnvVar documents one setting.
type EnvVar struct {
	Name string
	// Default is the text used when the variable is unset. Empty means there is no default.
	Default string
	Help    string
}

// EnvVars lists every environment variable the sidecar reads.
var EnvVars = []EnvVar{
	{"TAILSHARE_ADDR", "127.0.0.1:0", "Loopback address for the local API. Port 0 picks a free port and prints it."},
	{"TAILSHARE_TOKEN", "", "Per-launch secret from the Electron app. Required by serve."},
	{"TAILSHARE_REGION", "303", "Tailcat relay region id both peers use. Free relays: 301 NYC, 302 SFO, 303 FRA, 304 TOK."},
	{"TAILSHARE_DERP_MAP_URL", "", "Relay list URL. Empty means Tailcat's free relays."},
	{"TAILSHARE_DEV", "false", "Dev mode: coloured, chatty logs."},
}

// Load reads the settings, using the defaults in EnvVars for unset names.
func Load() (Config, error) {
	region, err := strconv.Atoi(get("TAILSHARE_REGION"))
	if err != nil || region <= 0 {
		return Config{}, fmt.Errorf("TAILSHARE_REGION must be a positive number, got %q", get("TAILSHARE_REGION"))
	}

	dev, err := strconv.ParseBool(get("TAILSHARE_DEV"))
	if err != nil {
		return Config{}, fmt.Errorf("TAILSHARE_DEV must be true or false, got %q", get("TAILSHARE_DEV"))
	}

	return Config{
		Addr:       get("TAILSHARE_ADDR"),
		Token:      get("TAILSHARE_TOKEN"),
		Region:     tailcfg.DERPRegionID(region),
		DERPMapURL: get("TAILSHARE_DERP_MAP_URL"),
		Dev:        dev,
	}, nil
}

// get returns the variable's value, or its default from EnvVars when unset.
func get(name string) string {
	if v, ok := os.LookupEnv(name); ok {
		return v
	}

	for _, e := range EnvVars {
		if e.Name == name {
			return e.Default
		}
	}

	panic("config: unknown variable " + name) // a typo in this package
}
