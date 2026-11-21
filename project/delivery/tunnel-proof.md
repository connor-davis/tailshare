# Tunnel proof: shared web server

Recorded 2026-11-21 against the real Tailcat relay, with two Tailshare sidecars
(`bin/tailshare.exe serve`) on one Windows PC, each with its own token and rooms
folder. Each run hosted a room, joined it by code and allowed the join, the
same steps a person takes.

## Shared local web server (port forwarding)

Script: `mystuff/proof/forward-proof.mjs`. Result: PASS.

- Alice shared a local web server on `127.0.0.1:<port>` with a label.
- Bob saw the share, opened it on his own `127.0.0.1:<port>`, and fetched the
  exact page body through the tunnel.
- Alice pressed Stop; Bob's local port closed.
- Reverse direction (the older member opening the newer member's share) also
  passed.

## Two PCs (owner, 2026-11-21)

The owner installed stable v0.1.2 (`Tailshare-Setup-0.1.2.exe`) on two physical
PCs, joined one room by code and reported the check passed:

- A local web server shared from one PC through the Apps tab opened on the
  other PC.

Reported by the owner in the session; no logs were captured on the PCs.
