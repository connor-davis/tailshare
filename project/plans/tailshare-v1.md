# Plan — Tailshare v1

> `/goal Build Tailshare v1 in D:\Programming\Polyphron\tailshare: an Electron + Go (Tailcat library) desktop file-sharing app with a React 19 / TanStack Router / Effect / shadcn UI, connected by 6-char seeded-key codes like 7K3-Q9P (no rendezvous server), offering an FTP-style two-way two-pane browser, a transfer queue with resume, and session-only chat, laid out like viper and 3reco with AGENTS.md and documented code; done when a Windows installer builds and two Windows PCs move a 1 GB file both ways using a 6-char code, and the Go and TS tests pass.`

Scope: `project/scope-briefs/tailshare-v1.md`. Security model: `docs/security.md`.

## Architecture

```
Electron main (TS + Effect) ── spawns ──> tailshare.exe (Go sidecar)
   │  typed IPC (Effect Schema)              │  localhost HTTP + WebSocket, per-launch token
Renderer (React, TanStack Router/Query/      │  Tailcat server/client ── tunnel ── peer's sidecar
 Table/Virtual, shadcn) ── fetch/WS ─────────┘
```

Peer protocol, inside the Tailcat tunnel on one TCP port: framed JSON control
messages (hello/rekey, list, stat, chat, transfer offer/ack) plus raw byte
streams for file data, one TCP stream per transfer.

## Steps (in order; each ends green)

| # | Step | Lands | Done when |
|---|------|-------|-----------|
| 1 | ✅ **Seeded-keys spike** | `internal/services/codes`, `docs/security.md` | Live relay test passes (done 2026-11-19). |
| 2 | ✅ **Repo skeleton** | `cmd/tailshare` (`version`, `env`), `internal/platform/config`, `tests/style_test.go`, `Taskfile.yml`, `staticcheck.conf`, `AGENTS.md`, `README.md`, `docs/{start-here,code-map,style-guide}.md` | Done 2026-11-20: `task check` green. `serve` and `apperr` move to step 7, when the API needs them. |
| 3 | ✅ **Session service** | `internal/services/session` | Host: code, `AddAllowedClient` admits only the first joiner, 10-min expiry, rekey to random keys. Join: by code. Test runs over a local DERP (`tstest/integration`), so it needs no internet. |
| 4 | ✅ **Peer protocol + shared folder** | `internal/services/peer`, `internal/services/share` | List, stat and the path guard (`..`, absolute paths, symlink escape) are rejected, with tests. |
| 5 | ✅ **Transfers** | `internal/services/transfer` | Two-way upload/download with a queue, pause, cancel, resume by offset and SHA-256 verify. A test kills a transfer mid-way and resumes it. |
| 6 | ✅ **Chat** | in `peer` | Session-only, in memory, never written to disk. |
| 7 | ✅ **Local API** | `internal/api` (Fiber v3 + WS) | Routes for session, files, transfers and chat. Live events over WS, no polling. Every route checks the token. |
| 8 | ✅ **Web workspace** | `web/` (npm workspaces + turbo, as in viper), `web/apps/desktop` | electron-vite, React 19, Tailwind 4, shadcn@latest init, TanStack Router (file routes), Query, Table, Virtual, Effect. |
| 9 | ✅ **Electron main** | `web/apps/desktop/src/main` | Effect layer: spawn and health-check the sidecar, restart on crash, native folder picker, typed IPC. |
| 10 | ✅ **Design system** | `DESIGN.md`, tokens CSS | Polyphron brand colours, light and dark, patterns from viper/3reco. |
| 11 | ✅ **UI** | routes: `/` (connect: host or join by code), `/session` (two panes, transfer queue dock, chat drawer) | Modern FTP layout. Drag a file between panes to transfer. Empty, loading and error states. |
| 12 | ✅ **Docs pass** | `docs/` (start-here, code-map, protocol), doc comments everywhere | Every exported symbol documented. |
| 13 | **Package + prove** | electron-builder NSIS, `task dist` | Installer bundles the Go exe. Two PCs move 1 GB both ways with a matching hash. |

## Decisions made

- Module `github.com/Polyphron-AI/tailshare`, Go 1.27.
- Fixed home relay region 303 (Frankfurt) in config. Self-hosted DERP comes later and only changes config.
- Codes: 6 Crockford base32 chars; look-alikes (O/I/L) are folded on input.
- Only one dependency was added beyond Tailcat: `golang.org/x/crypto/argon2`.

## Out of scope (v1)

Own DERP relay, macOS/Linux builds, saved history, more than 2 peers, auto-update, code signing.

Step 13 is built (`task dist`, packaged smoke passed). Its two-PC 1 GiB proof is next.
