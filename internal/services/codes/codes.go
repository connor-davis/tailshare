// Package codes turns a short share code like "7K3Q-9PXM" into a full Tailcat
// address, with no server in between ("seeded keys").
//
// A Tailcat address carries a random node key and a pre-shared key, so it is
// about 100 characters and cannot be compressed. Instead of shrinking it, both
// sides grow it back from the short code: Argon2id stretches the code into 64
// bytes, which become the host's node private key and pre-shared key. The
// joiner runs the same derive and rebuilds the host's address on its own.
//
// The code holds 40 bits, so it is guessable offline by anyone who sees the
// derived public key (for example a relay operator). Callers must keep codes
// single-use and short-lived, and must move the session onto fresh random keys
// once connected. See docs/security.md.
package codes

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"

	"github.com/tailscale/tailcat"
	"golang.org/x/crypto/argon2"
	"tailscale.com/tailcfg"
	"tailscale.com/types/key"
)

// alphabet is Crockford base32: no I, L, O or U, so codes are easy to read aloud.
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// Length is the number of code characters, not counting the dash.
const Length = 8

// salt is fixed so both peers derive the same keys. Changing it breaks
// compatibility with every older build.
var salt = []byte("tailshare seeded-keys v1")

// Argon2id cost. Tuned to take a few hundred milliseconds on a laptop so that
// guessing all 2^40 codes is expensive. Changing these breaks compatibility.
const (
	argonTime    = 3
	argonMemory  = 64 * 1024 // KiB
	argonThreads = 4
)

// ErrInvalid is returned by Parse for input that is not a valid code.
var ErrInvalid = errors.New("Share codes are 8 letters or digits, like 7K3Q-9PXM.")

// Code is a normalised share code: 8 upper-case Crockford base32 characters,
// without the dash.
type Code string

// New returns a fresh random code.
func New() Code {
	var b [Length]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err) // crypto/rand never fails on supported platforms
	}
	for i := range b {
		b[i] = alphabet[b[i]&31]
	}
	return Code(b[:])
}

// Parse normalises user input into a Code. It ignores case, spaces and dashes,
// and reads the look-alikes O as 0 and I or L as 1.
func Parse(s string) (Code, error) {
	s = strings.NewReplacer("-", "", " ", "", "O", "0", "I", "1", "L", "1").Replace(strings.ToUpper(s))
	if len(s) != Length {
		return "", ErrInvalid
	}
	for _, r := range s {
		if !strings.ContainsRune(alphabet, r) {
			return "", ErrInvalid
		}
	}
	return Code(s), nil
}

// String formats the code for display, like "7K3Q-9PXM".
func (c Code) String() string {
	if len(c) != Length {
		return string(c)
	}
	return string(c[:4]) + "-" + string(c[4:])
}

// Keys holds the host identity derived from a code.
type Keys struct {
	Node key.NodePrivate      // the host's WireGuard node key
	PSK  tailcat.PresharedKey // the WireGuard pre-shared key
}

// Derive stretches c into the host's keys. The same code always gives the same
// keys. It is slow on purpose (see the Argon2id cost above).
func Derive(c Code) Keys {
	out := argon2.IDKey([]byte(c), salt, argonTime, argonMemory, argonThreads, 64)
	var node [32]byte
	copy(node[:], out[:32])
	// Clamp to a valid Curve25519 scalar, as key.NewNode does.
	node[0] &= 248
	node[31] = (node[31] & 127) | 64
	var k Keys
	if err := k.Node.UnmarshalText([]byte("privkey:" + hex.EncodeToString(node[:]))); err != nil {
		panic(err) // unreachable: the input is always 32 hex-encoded bytes
	}
	copy(k.PSK[:], out[32:])
	return k
}

// Addr rebuilds the host's full Tailcat address from c, for a host listening
// on the given DERP region. The joiner uses this instead of being sent the
// long address.
func Addr(c Code, region tailcfg.DERPRegionID) tailcat.Addr {
	k := Derive(c)
	ci := tailcat.ConnInfo{
		ServerPublic:      tailcat.NodePublic{NodePublic: k.Node.Public()},
		ServerDiscoPublic: tailcat.DiscoPublicForNode(k.Node),
		PresharedKey:      k.PSK,
		RegionID:          region,
	}
	return ci.Addr()
}
