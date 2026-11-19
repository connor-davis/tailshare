## Scope Brief — Tailshare v1 (peershare replacement)

> **Goal:**
> `/goal Build Tailshare v1 in D:\Programming\Polyphron\tailshare: an Electron + Go (Tailcat library) desktop file-sharing app with a React 19 / TanStack Router / Effect / shadcn UI, connected by 6-char seeded-key codes like 7K3-Q9P (no rendezvous server unless the Tailcat custom-key spike fails), offering an FTP-style two-way two-pane browser, a transfer queue with resume, and session-only chat, laid out like viper and 3reco with AGENTS.md and documented code; done when a Windows installer builds and two Windows PCs move a 1 GB file both ways using a 6-char code, and the Go and TS tests pass.`

### 1. Objective
Replace `connor-davis/peershare` (an old JS Electron app) with a fast, modern
peer-to-peer file sharing app. It must work between any two machines with no
accounts and no tailnet, and its share codes must be short (6 chars, not
Tailcat's ~58-char address).

### 2. In Scope
- **Connect by short code.** One side hosts a session and shows a 6-char code
  (`7K3-Q9P`). The other side types it in and connects.
- **FTP-style two-pane browser.** Local files on the left, the peer's shared
  folder on the right. Each side picks one folder to share. Transfers go **both
  ways**: you can download from them and upload into their folder.
- **Transfer queue.** A bottom panel with progress, speed, pause, cancel and
  **resume after a drop** (resume by byte offset plus a hash check).
- **Session-only chat.** A chat pane that lives only while the session is open.
  It is never written to disk.
- **Relays.** Use Tailcat's free DERP relays for v1. Keep the DERP map in
  config so a self-hosted relay can be swapped in later (see Out of Scope).
- **Docs.** Every exported Go symbol and TS export gets a doc comment.
  Includes root `AGENTS.md`, `README.md`, `DESIGN.md` and `docs/`.

### 3. Out of Scope (explicit non-goals)
- Self-hosted DERP relay. It is planned next, not in v1. v1 only leaves the
  config hook for it.
- A code-desk or rendezvous server. It is only a fallback if the spike in
  Constraints fails.
- macOS and Linux builds and testing. The code should stay portable, but v1 is
  proven on Windows only.
- Saved chat or transfer history, accounts, contacts or peer address books.
- More than two peers in one session.
- Auto-update and code signing.

### 4. Deliverables
| Artifact | Format / location | Notes |
|----------|-------------------|-------|
| Go backend (sidecar) | `cmd/tailshare`, `internal/{api,services,platform}` | Tailcat library, session/transfer/chat services, localhost API (Fiber v3 + WebSocket, as in viper/3reco). Seeded-key code logic is in `internal/services/codes`. |
| Electron shell | `web/apps/desktop` (main + preload) | Effect runs the sidecar lifecycle (spawn, health, restart), uses typed IPC with Effect Schema, and handles the native folder picker. |
| React UI | `web/apps/desktop/src` (renderer) | React 19, Vite, TanStack Router (file routes), TanStack Query, TanStack Table (file lists), TanStack Virtual (big folders), Tailwind 4, shadcn/ui@latest. |
| Brand + design | `DESIGN.md`, Tailwind tokens | Polyphron brand colours from `D:\Programming\Polyphron\polyphron`. UI patterns from viper/3reco. Modern FTP layout. Light and dark themes. |
| Agent + project docs | `AGENTS.md`, `README.md`, `docs/`, `Taskfile.yml` | Same AGENTS.md layout and practices as viper/3reco. |
| Tests | Go `_test.go`, Vitest | Covers the code derive round-trip, path-escape guards, resume and the transfer protocol. |
| Windows installer | `dist/` via electron-builder | Bundles the Go binary. |

### 5. Constraints
- **Stack:** Electron, Go, React + TanStack + Effect + shadcn. Tailscale has no
  usable JS package: `@tailscale/connect` needs a tailnet, and Tailcat's
  WASM build is relay-only. So the network layer is Go.
- **Short-code scheme ("seeded keys"):** the 6-char code is Crockford base32
  (30 bits). It is fed into Argon2id with fixed params and a fixed app salt,
  and the result becomes the Tailcat listener keypair. The receiver re-derives
  the same public key to rebuild the address. The DERP region is fixed per
  build or encoded in the derive step. After connecting, both sides run a
  handshake inside the tunnel, rekey to fresh random keys and reconnect. The
  code dies after one use or 10 minutes.
- **Spike first (blocking):** check that the Tailcat library accepts a
  caller-supplied private key, and that the address is rebuildable from
  public key + region. If either fails, fall back to a tiny code-desk server
  with PAKE, and the user gets asked again before that server is built.
- **Security:** a 30-bit code can be guessed offline by anyone who sees the
  derived public key, which includes the relay operator. The defences are the
  slow Argon2 derive, single use, the 10-minute expiry and the rekey. This
  risk is accepted for v1 and must be written up in `docs/`. Shared-folder
  paths must reject `..` and symlink escapes. Uploads are only allowed into
  the chosen folder.
- **Layout:** follows viper/3reco (`cmd/`, `internal/`, `web/apps/`,
  `Taskfile.yml`, `staticcheck.conf`, `tests/`). No git worktrees. Containers
  (if any) run through Kiri `docker`.

### 6. Success Criteria (Definition of Done)
- [ ] Spike result recorded in `docs/` (seeded keys work, or the fallback was taken).
- [ ] The Windows installer builds with one `task` command and installs on two PCs.
- [ ] PC A hosts and shows a 6-char code. PC B types it and connects across different networks.
- [ ] A 1 GB file moves A→B and B→A. Its hash matches on arrival.
- [ ] A transfer that is killed mid-way resumes and finishes with a matching hash.
- [ ] Chat messages flow both ways and are gone after the session closes.
- [ ] Path-escape attempts (`..`, absolute paths, symlinks) are rejected, and a test proves it.
- [ ] `go test ./...`, staticcheck, Vitest and the typecheck all pass.
- [ ] Every exported Go/TS symbol has a doc comment, and AGENTS.md matches the viper/3reco structure.
- [ ] The UI renders in light and dark themes with Polyphron brand colours.

### 7. Audience / Context
Connor and the people they share files with: two Windows machines on any
networks, with no Tailscale account. It is a desktop app, not a web service.

### 8. Open Assumptions
- The chat note in round 2 was cut off ("talk to each other in the…"). It is
  read here as chat inside the open session.
- Only the backend uses Go. "We do want to use TypeScript" is read as TS for
  all of the Electron and UI code.
- Electron's main process talks to the sidecar over localhost HTTP/WebSocket
  with a random per-launch token, not over stdio.

### 9. Confidence (final)
| Area | Score |
|------|-------|
| Objective | 90 |
| Boundaries | 85 |
| Deliverables | 85 |
| Constraints | 82 |
| Success | 88 |
| Audience | 90 |

### 10. User notes captured during scoping
- "Can we please use Effect? I've heard that Effect is very good for desktop applications"
- "Is there not some sort of magic that we can do to basically turn the long code into a tiny code and then be able to undo it so that we get the long code back"
- "Let's start off with tailscat free relays and then we'll set up our own relay"
- "Fold out pick and they can also upload to my side so it should be like a two-way thing. We should also have messaging so that we can talk to each other in the"
- "Well we do want to use TypeScript but you should be able to come up with your own compression stuff. I don't know. Invent something, come up with something"
- Codes: "6 chars: 7K3-Q9P"
