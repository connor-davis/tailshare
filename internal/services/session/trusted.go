package session

import (
	"errors"
	"sync"

	"tailscale.com/types/key"
)

// MaxTrusted is how many computers the host may trust at once.
const MaxTrusted = 100

// Trusted is the host's in-memory list of computers that skip the Allow prompt. It holds
// full node public keys only, never names or fingerprints. The desktop app keeps the saved
// copy and sends the whole list again after every start or change.
type Trusted struct {
	mu   sync.RWMutex
	keys map[string]struct{}
}

// NewTrusted returns an empty list, so nobody is trusted until the app says so.
func NewTrusted() *Trusted {
	return &Trusted{keys: make(map[string]struct{})}
}

// Set replaces the whole list. Every key must be a canonical node public key and there may
// be at most MaxTrusted. A bad list changes nothing.
func (trusted *Trusted) Set(keys []string) error {
	if len(keys) > MaxTrusted {
		return errors.New("You can trust up to 100 computers.")
	}

	next := make(map[string]struct{}, len(keys))
	for _, text := range keys {
		var public key.NodePublic
		// String must give the text back: only one spelling of a key may match.
		if public.UnmarshalText([]byte(text)) != nil || public.IsZero() || public.String() != text {
			return errors.New("One of the trusted computers has a key that is not valid.")
		}

		next[text] = struct{}{}
	}

	trusted.mu.Lock()
	trusted.keys = next
	trusted.mu.Unlock()

	return nil
}

// Has says whether this exact key is trusted. A nil list trusts nobody.
func (trusted *Trusted) Has(public string) bool {
	if trusted == nil {
		return false
	}

	trusted.mu.RLock()
	defer trusted.mu.RUnlock()
	_, ok := trusted.keys[public]

	return ok
}
