# Security: short share codes

## How a 6-character code connects two machines ("seeded keys")

A Tailcat address holds a random node key and a random pre-shared key. That
makes it about 100 characters long, and random data cannot be compressed. So
Tailshare does not shrink the address. Both sides grow it back from the code:

1. The host makes a random code, such as `7K3-Q9P` (Crockford base32, 30 bits).
2. Argon2id (time 3, 64 MiB, 4 threads, fixed salt) stretches the code into 64
   bytes: a node private key and a WireGuard pre-shared key.
3. The host runs a Tailcat server with those keys on the home relay region.
4. The joiner runs the same derive and builds the host's address
   (`codes.Addr`). The long address is never sent anywhere.

Code: `internal/services/codes`.

## Spike result (2026-11-19)

`TestSeededKeysConnect` passed against Tailcat's free relays (region 303,
Frankfurt). A host listened with code-derived keys, and a joiner that knew
only the code connected and read data in about 3 seconds. Seeded keys work,
so no code-desk server is needed.

Run it with: `TAILSHARE_NET=1 go test -run SeededKeys ./internal/services/codes`

## The risk we accept, and how we limit it

30 bits is guessable offline. Anyone who sees the host's public key can try
every code until one derives that key. The relay operator sees it, and
Tailcat's free relays keep metadata logs. That attacker would then hold the
pre-shared key and could join.

Limits, all required:

- **Slow derive.** Argon2id with 64 MiB makes each guess cost real memory and
  time. All 2^30 codes cost years of CPU on one machine, but a GPU farm can do
  it much faster.
- **Single use.** The host admits only the first joiner (`AllowClient`), then
  rejects everyone else.
- **Short life.** A code expires 10 minutes after it is shown.
- **Rekey.** Right after the first connect, both sides move to fresh random
  Tailcat keys exchanged inside the tunnel. The code-derived keys only guard
  the first seconds.
- **Own relay later.** Moving to a self-hosted DERP relay removes the
  third-party operator from the threat.

## Region

The relay region is not secret and is not in the code. Both peers use the
app's home region (default 303, Frankfurt). Tailcat's free relays are 301 NYC,
302 SFO, 303 FRA and 304 TOK. The bootstrap goes through the relay, then
Tailcat upgrades to a direct link when NAT allows.

## Shared folders

Every path from a peer is resolved inside the shared root. `..`, absolute
paths and symlinks that leave the root are rejected. Uploads land only in the
shared folder.
