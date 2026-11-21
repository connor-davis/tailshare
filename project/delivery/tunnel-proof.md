# Tunnel proof: shared web server and screen share

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

## Screen share (experimental)

Script: `mystuff/proof/screen-proof.mjs`. Result: PASS.

- Alice started a screen share and sent WebM chunks into her ingest socket.
- Bob saw the share, opened his watch socket, and got the start chunks and a
  later live chunk byte for byte.
- Alice's state showed 1 viewer. Alice pressed Stop; Bob's watch socket closed.
- Real capture and playback were also checked in Electron (canvas recording
  through MediaSource across three epochs, desktop tests).

## Two PCs (owner, 2026-11-21)

The owner installed stable v0.1.2 (`Tailshare-Setup-0.1.2.exe`) on two physical
PCs, joined one room by code and reported both checks passed:

- A local web server shared from one PC through the Apps tab opened on the
  other PC.
- A live screen share (real capture) showed on the other PC.

Reported by the owner in the session; no logs were captured on the PCs.
