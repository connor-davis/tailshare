// Package config reads every setting from environment variables. The list
// in EnvVars is the single source: usage text and docs follow it.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"

	"tailscale.com/tailcfg"
	"tailscale.com/types/key"
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

	// MainToken permits local path operations and is never given to the renderer.
	MainToken string

	// RoomsDir holds persistent folders named by canonical room code.
	RoomsDir string

	// Region is the preferred relay for the next room. Joining discovers the host
	// across all four free regions. It is not secret or part of the share code.
	Region tailcfg.DERPRegionID

	// Nearest picks the lowest-latency free relay at the next host or join.
	Nearest bool

	// DERPMapURL is where the relay list comes from. Empty means Tailcat's
	// free relays; set it to a self-hosted DERP map to use your own relay.
	DERPMapURL string

	// Identity is this computer's secret join key as "privkey:" and 64 hex characters, from
	// the Electron app. A host can only recognise a trusted computer if this stays the same
	// between joins. Empty means a new random key for every join. Never log it.
	Identity string

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
	{"TAILSHARE_MAIN_TOKEN", "", "Main-process secret for local path operations."},
	{"TAILSHARE_ROOMS_DIR", "", "Absolute directory for persistent room folders. Required to host or join."},
	{"TAILSHARE_REGION", "303", "Relay preference: 301 NYC, 302 SFO, 303 FRA, 304 TOK, or nearest."},
	{"TAILSHARE_DERP_MAP_URL", "", "Relay list URL. Empty means Tailcat's free relays."},
	{"TAILSHARE_DEV", "false", "Dev mode: coloured, chatty logs."},
	{"TAILSHARE_IDENTITY", "", "Secret join key from the Electron app. Empty means a random key per join."},
}

// Load reads the settings, using the defaults in EnvVars for unset names.
func Load() (Config, error) {
	region, nearest, err := ParseRegion(get("TAILSHARE_REGION"))
	if err != nil {
		return Config{}, err
	}

	dev, err := strconv.ParseBool(get("TAILSHARE_DEV"))
	if err != nil {
		return Config{}, fmt.Errorf("TAILSHARE_DEV must be true or false, got %q", get("TAILSHARE_DEV"))
	}

	cfg := Config{
		Addr:       get("TAILSHARE_ADDR"),
		Token:      get("TAILSHARE_TOKEN"),
		MainToken:  get("TAILSHARE_MAIN_TOKEN"),
		RoomsDir:   get("TAILSHARE_ROOMS_DIR"),
		Region:     region,
		Nearest:    nearest,
		DERPMapURL: get("TAILSHARE_DERP_MAP_URL"),
		Dev:        dev,
		Identity:   get("TAILSHARE_IDENTITY"),
	}
	if _, err := cfg.IdentityKey(); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

// IdentityKey parses Identity. An empty Identity gives the zero key, which means "make a
// random key for each join". The error never repeats the secret.
func (cfg Config) IdentityKey() (key.NodePrivate, error) {
	var private key.NodePrivate
	if cfg.Identity == "" {
		return private, nil
	}

	if err := private.UnmarshalText([]byte(cfg.Identity)); err != nil || private.IsZero() {
		return key.NodePrivate{}, errors.New("TAILSHARE_IDENTITY must be privkey: and 64 hex characters.")
	}

	return private, nil
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

// ParseRegion validates the desktop relay preference. Nearest starts with FRA as its fallback.
func ParseRegion(value string) (tailcfg.DERPRegionID, bool, error) {
	if value == "nearest" {
		return 303, true, nil
	}
	switch value {
	case "301", "302", "303", "304":
		region, _ := strconv.Atoi(value)
		return tailcfg.DERPRegionID(region), false, nil
	default:
		return 0, false, fmt.Errorf("TAILSHARE_REGION must be 301, 302, 303, 304 or nearest.")
	}
}
