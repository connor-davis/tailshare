# Code map

Which file owns which job. Read this before you write a new helper, and add a
line when you add an owner.

## Share codes

| Job | Owner |
| --- | --- |
| Code alphabet, random eight-character codes, parsing user input (look-alikes, dashes), 4+4 display | `internal/services/codes/codes.go` (`New`, `Parse`, `Code.String`) |
| Code to node key + pre-shared key (Argon2id), and code to full Tailcat address | `internal/services/codes/codes.go` (`Derive`, `Addr`) |
| Parse/derive tests and the live relay spike | `internal/services/codes/codes_test.go` |

## Sessions

| Job | Owner |
| --- | --- |
| Share lifetime, roster snapshots, changes, per-member control and data tunnel access | `internal/services/session/session.go` (`Session`, `Options`, `Members`, `Pending`, `Close`) |
| Code server, takeover startup and unused-code expiry | `internal/services/session/host.go` (`Host`) |
| Join by code and resolve the relay address | `internal/services/session/join.go` (`Join`) |
| Bounded authenticated join line without consuming hello, handshake deadline cleanup | `internal/services/session/joinline.go` |
| Local Allow/Deny prompt, decision timeout and admission peer handlers | `internal/services/session/admission.go` |
| Control startup, handler merge, leave/loss watchers and takeover delay | `internal/services/session/mesh.go` |
| Offline session admission, identity, expiry, leave and takeover tests (on `tailcattest`) | `internal/services/session/*_test.go` |

## Peer protocol

The wire format is written up in [protocol.md](protocol.md).

| Job | Owner |
| --- | --- |
| Start a conversation, hello and version choice, request/response/event API for the local API, extra handlers | `internal/services/peer/peer.go` (`Start`, `Peer`, `Call`, `Notify`, `Options`) |
| Frame format: 4-byte length + JSON, 1 MiB cap | `internal/services/peer/frame.go` |
| Envelope, method names, error codes, typed hello/list/chat and transfer payloads | `internal/services/peer/message.go` |
| Protocol v2 share methods, member/link/admission payloads and size limits | `internal/services/peer/share.go` |
| The one reader, request routing, answers, closing | `internal/services/peer/dispatch.go` |
| List and stat, asking and answering | `internal/services/peer/browse.go` (`List`, `Stat`) |
| Chat: checks, 200-message memory history, events and subscriptions | `internal/services/peer/chat.go` (`SendChat`, `Subscribe`, `Event`) |
| Frame, protocol, chat and over-a-real-session tests | `internal/services/peer/*_test.go` |

## Mesh foundations

Session owns the code server and local approval; mesh owns independently keyed member links.

| Job | Owner |
| --- | --- |
| Mesh server lifetime, roster snapshots and installation, member removal and control-peer registration | `internal/services/mesh/mesh.go` (`New`, `Mesh`, `SetRoster`, `Remove`, `RegisterPeer`) |
| Strict share payload, roster, name, public key and Tailcat address checks | `internal/services/mesh/validate.go` |
| Fresh client per link, bounded dial, authenticated expected-key accept and member stream cleanup | `internal/services/mesh/link.go` (`Link`, `NewLink`, `Dial`, `Accept`) |
| Per-member bounded data queues, outgoing data streams and close on departure | `internal/services/mesh/tunnel.go` (`Tunnel`) |
| Locally approved admission slot, roster/links/admit handlers, preparation expiry and authenticated leave | `internal/services/mesh/admit.go` (`BeginAdmission`, `Admission.Handlers`, `Mesh.Handlers`, `HandleEvent`) |
| Offline Tailcat facts: many clients, silent unlisted clients, duplicate-key starvation | `internal/services/mesh/tailcat_test.go` |
| Mesh roster/admission abuse guards and real three-member links/departure | `internal/services/mesh/guard_test.go`, `internal/services/mesh/link_test.go` |
| Version 1 refusal, validated EventShare and local-only Allow/Deny tests | `internal/services/peer/protocol_test.go`, `internal/services/peer/share_test.go` |

## Shared folders

| Job | Owner |
| --- | --- |
| Confined child room creation and reuse | `internal/services/share/room.go` (`OpenRoom`) |
| Regular-file import, atomic no-replace copy and collision names | `internal/services/share/import.go` (`Import`, `AvailableName`, `NumberedName`); `import_windows.go`, `import_other.go` (link and junction checks) |
| Open the shared folder once (`os.Root`), list, stat, close | `internal/services/share/share.go` (`Open`, `Root`) |
| Peer path rules (slash paths, no `..`, drives, streams, device names) | `internal/services/share/path.go` (`Localize`) |
| Partial-file access, regular-file checks and no-replace hard-link publication | `internal/services/share/partial.go` (`PartialSize`, `OpenPartial`, `ReadPartial`, `Commit`, `RemovePartial`) |
| Private partial suffix, peer-path refusal and listing filter | `internal/services/share/path.go` (`PartialSuffix`), `internal/services/share/share.go` (`List`) |
| Confined read and exclusive-create for downloads and uploads | `internal/services/share/files.go` (`OpenRead`, `Create`) |
| Path table, escape, link and junction tests | `internal/services/share/*_test.go` |

## Local API

| Job | Owner |
| --- | --- |
| Error type for the screen (status, stable code, plain sentence) | `internal/platform/apperr/apperr.go` (`Error`, `New`, `BadRequest`, `Internal`) |
| API construction, listener, shutdown, route table, the one state owner | `internal/api/server.go` (`Server`, `New`, `Listen`, `Serve`, `Shutdown`) |
| Host, Origin and bearer-token guard, CORS preflight, live-socket handshake check | `internal/api/middleware.go` (`guard`) |
| Service and peer errors to safe API errors, the JSON error handler | `internal/api/errors.go` (`errorHandler`, `toAppError`) |
| Host, join, leave, session state and peer-loss cleanup | `internal/api/session.go` |
| Local admission Allow/Deny routes and pending-ID validation | `internal/api/session_joins.go` |
| Local room and peer folder listing | `internal/api/files.go` |
| Canonical room root and per-session manager creation | `internal/api/rooms.go` |
| Main-only header guard, consented file import and downloads root configuration | `internal/api/room_files.go` |
| Chat routes (memory-only history from the peer) | `internal/api/chat.go` |
| Transfer routes, the session-owned `Transfers` interface and API DTOs | `internal/api/transfers.go` (`Transfers`, `TransferItem`) |
| Manager adapter, direction/path mapping, state/progress events and subscription recovery | `internal/api/transfer_manager.go` (`managedTransfers`), `internal/api/session.go` (manager lifetime) |
| One event hub, bounded client queues, snapshot-first WebSocket | `internal/api/live.go` (`hub`, `Event`, `Snapshot`) |
| `tailshare serve`: startup checks, ready line, stdin/signal shutdown | `cmd/tailshare/serve.go` |
| API route, guard, live, session and transfer tests (fake manager, SHA-256 upload/download over local relay, subscription overflow) | `internal/api/*_test.go`, `cmd/tailshare/serve_test.go` |

## Test support

| Job | Owner |
| --- | --- |
| Local relay for offline network tests: `Init` (call from `TestMain`), `LocalDERP`, `ServeMap` | `internal/testsupport/tailcattest/tailcattest.go` |

## Settings and binary

| Job | Owner |
| --- | --- |
| Every env setting, its default and help text | `internal/platform/config/config.go` (`EnvVars`, `Load`) |
| Build version string | `internal/platform/config/config.go` (`Version`), set by `task build` |
| CLI commands (`version`, `env`, `serve`) | `cmd/tailshare/main.go`, `cmd/tailshare/serve.go` |

## Repo checks

| Job | Owner |
| --- | --- |
| No file over 900 lines; doc comment on every exported top-level Go name (struct fields only where the [style guide](style-guide.md) asks) | `tests/style_test.go` |
| Staticcheck settings | `staticcheck.conf` |

## Desktop app

Paths below are relative to `web/apps/desktop` unless stated otherwise.

| Job | Owner |
| --- | --- |
| npm workspace, task graph, shared compiler/format/lint rules | `web/package.json`, `web/turbo.json`, `web/tsconfig.json`, `web/prettier.config.js`, `web/eslint.config.js` |
| Desktop commands and isolated build targets | `package.json`, `electron.vite.config.ts`, `tsconfig*.json` |
| Windows installer, packaged sidecar, app identity and GitHub update feed | `electron-builder.yml`, `src/main/index.ts` |
| Ordered publish-free builds, version/channel overrides and pinned staticcheck | root `Taskfile.yml` (`dist`, `build`, `icons`, `vet`) |
| SVG to verified multi-size ICO and app/tray PNGs | `scripts/export-icons.mjs`, `build/logo.svg`, `build/icon.ico`, `build/icon.png`, `build/tray-16.png`, `build/tray-32.png` |
| Packaged update lifecycle, channel checks, bounded HTML-to-Markdown release notes, explicit downloads and sidecar-safe installation | `src/main/updater.ts`, `src/main/updater.test.ts` |
| Atomic JSON desktop preferences in userData, corruption fallback | `src/main/settings.ts`, `src/main/settings.test.ts` |
| `--profile=<name>` flag: a separate userData folder and single-copy lock, for a second copy on one computer | `src/main/profile.ts`, `src/main/profile.test.ts` |
| Settings/update sender and argument guards, HTTPS github.com external-link validation, typed request/event bridge | `src/main/ipc.ts`, `src/shared/ipc-schema.ts`, `src/shared/bridge.ts`, `src/preload/index.ts` |
| Settings dialog (open state in context, gear buttons call `useOpenSettings`): menu You, Saving, Transfers, App, Updates | `src/renderer/src/components/settings/settings-dialog.tsx`, `settings-fields.tsx`, `setting-row.tsx`, `settings-dialog.test.tsx` beside them |
| Settings load, push follow and save (plain-sentence errors) | `src/renderer/src/components/settings/use-settings.ts` |
| Updates section of the settings dialog: Stable/Nightly choice, release notes, explicit Download, progress, Check for updates and restart action | `src/renderer/src/components/settings/updates-card.tsx`, `updates-card.test.tsx` beside it |
| Light and dark follow the system (`followColorScheme`) | `src/renderer/src/lib/theme.ts`, `theme.test.ts` beside it |
| jsdom stand-ins (ResizeObserver, matchMedia, scroll) for renderer tests | `src/test-setup.ts` (named in `vitest.config.ts`) |
| Windows CI and source-branch enforcement | root `.github/workflows/ci.yml`, `.github/workflows/branch-flow.yml` |
| Stable releases from main and versioned nightly prereleases from develop | root `.github/workflows/release.yml`, `.github/workflows/nightly.yml` |
| Installer build instructions, unsigned builds and firewall guidance | `README.md` |
| Windows package smoke evidence and owner-confirmed two-PC proof closure | root `project/delivery/tailshare-v1-proof.md` |
| Electron lifecycle and wiring (quit waits for the sidecar to stop; registers the `tailshare:` protocol, reads join links from first-launch and second-instance argv, holds them until the page sends ready) | `src/main/index.ts` |
| Settings store: schema defaults, tolerant read, `.bak` on a corrupt file, atomic write, change listeners | `src/main/settings.ts` |
| Settings field rules (one place, shared by main and the bridge types) | `src/shared/ipc-schema.ts` (`SETTINGS_FIELDS`) |
| Tray: Open / Quit menu, tooltip, icon paths (dev `build/`, packaged resources) | `src/main/tray.ts` |
| Close-to-tray decision, show window, `--hidden` start | `src/main/lifecycle.ts` |
| Start with Windows (login item, packaged builds only) | `src/main/login-item.ts` |
| Window options (native Windows caption buttons via `titleBarOverlay`, symbol colour follows the theme), navigation lock and the socket Origin rewrite (`fixSocketOrigin`) | `src/main/window.ts` |
| Window drag strip on top of each column (no window-wide title bar; 138 px kept free for the native buttons) | `src/renderer/src/components/drag-bar.tsx`, `drag-bar.test.tsx` beside it |
| Update available button and dialog with per-version dismissal, shown in the main top bar | `src/renderer/src/components/update-button.tsx`, `update-button.test.tsx` beside it |
| Shell pieces: main top bar, empty state, join form and dialog, new-room name dialog, share code with Copy code/Copy link and countdown, name editor | `src/renderer/src/routes/-components/` (`main-bar`, `empty-state`, `join-form`, `join-dialog`, `new-room-dialog`, `share-code`, `code-countdown`, `name-editor`) |
| Update event subscription and initial-read race guard, shared by Settings and the update button | `src/renderer/src/components/use-update-status.ts` |
| Allowlisted Markdown release notes in ScrollArea, guarded GitHub link clicks and explicit Download action, shared by Settings and the update dialog | `src/renderer/src/components/update-release.tsx` |
| `tailshare://join/<CODE>` strict parser, argv scan and the hold-until-ready inbox | `src/main/join-link.ts`, `src/main/join-link.test.ts` |
| Recent rooms store: `recent-rooms.json` in userData, max 20, 30-day prune, atomic write, change listeners | `src/main/recent-rooms.ts`, `src/main/recent-rooms.test.ts` |
| Sidecar supervisor: start, health, restart with backoff, stop (Effect service and layer) | `src/main/sidecar.ts` |
| Room file IPC, canonical folder opening and main-only HTTP calls | `src/main/room-ipc.ts` (`registerRoomIpc`, `roomFolder`, `callMainApi`) |
| Real sidecar process (spawn, both tokens, room storage env, stdin pipe) | `src/main/sidecar-process.ts` |
| Ready-line parsing with a size bound | `src/main/ready-line.ts` |
| Health check call | `src/main/health.ts` |
| Sidecar binary path (dev `bin/`, packaged resources) | `src/main/config.ts` |
| IPC handlers: sender check, schema checks, folder dialog, recent rooms get/touch/remove | `src/main/ipc.ts` |
| IPC channel names and payload schemas | `src/shared/ipc-schema.ts` |
| Typed bridge (`window.tailshare`, incl. `onJoinLink`, recent rooms calls and events) and its browser declaration | `src/preload/index.ts`, `src/shared/bridge.ts`, `src/renderer/src/types/desktop.d.ts` |
| Desktop tests (`task test:web`; `@` alias for tests) | `src/**/*.test.ts(x)` (vitest), `vitest.config.ts` |
| Renderer entry and Content Security Policy | `src/renderer/index.html` |
| Query client and hash router | `src/renderer/src/main.tsx` |
| Root outlet, live socket start, sidecar banner, announcements | `src/renderer/src/routes/__root.tsx`, `src/renderer/src/components/sidecar-banner.tsx`, `src/renderer/src/components/status-region.tsx` |
| App shell: rooms sidebar (New room, Join, search), room (header with Open folder, chat column, transfers panel at the bottom), members column; panel sizes saved per computer | `src/renderer/src/routes/index.tsx`, `src/renderer/src/routes/-components/` (`room-sidebar`, `room-view`, `room-header`, `room-chat`, `members-panel`, `transfers-panel`, `panel-layout.ts`, `recent-rooms.ts`) |
| Local join prompt, pending/error state and Allow/Deny actions | `src/renderer/src/routes/-components/join-request.tsx`, `join-request.test.tsx` beside it |
| Code typing, folding and display (mirrors `codes.Parse`) | `src/renderer/src/lib/code-input.ts` |
| Byte, speed, time and date text | `src/renderer/src/lib/format.ts` |
| Local API client, query keys, hooks and types (match `internal/api`) | `src/renderer/src/lib/api/` |
| One live socket, seq ordering, reconnect, cache updates | `src/renderer/src/lib/live/` |
| Chat composer (Enter sends, grows to 8 lines, Add files button) and file card (Download, progress, Saved) | `src/renderer/src/routes/-components/` (`chat-composer.tsx`, `file-card.tsx`) |
| Adding files from the button or a drop, one chat message per file | `src/renderer/src/routes/-components/use-share-files.ts` (calls `window.tailshare.addFiles` and `addDroppedFiles`) |
| Transfer row (the only piece left in `session/`) | `src/renderer/src/routes/session/-components/transfer-row.tsx` |
| Generated route tree (router plugin owns it) | `src/renderer/src/routeTree.gen.ts` |
| shadcn generation and class utility | `components.json`, `src/renderer/src/lib/utils.ts` |
| Shared UI primitives (shadcn) | `src/renderer/src/components/ui/` (`alert.tsx`, `breadcrumb.tsx`, `button.tsx`, `card.tsx`, `empty.tsx`, `context-menu.tsx`, `field.tsx`, `input.tsx`, `label.tsx`, `progress.tsx`, `radio-group.tsx`, `resizable.tsx`, `scroll-area.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `skeleton.tsx`, `switch.tsx`, `table.tsx`, `tabs.tsx`, `textarea.tsx`, `badge.tsx`, `tooltip.tsx`; added with shadcn CLI 4.23.0) |
| Design rules and light/dark semantic tokens | root `DESIGN.md`, `src/renderer/src/styles/globals.css` |

## Transfers

| Job | Owner |
| --- | --- |
| Transfer states, snapshots, events and ID validation | `internal/services/transfer/transfer.go` (`State`, `Transfer`, `Event`) |
| Queue, two shared slots, pause, cancel, resume and lifetime | `internal/services/transfer/manager.go` (`Manager`, `New`, `Attach`, `Done`) |
| Offer and download-resume checks, duplicate offer refusal | `internal/services/transfer/offer.go` |
| Data streams, bounded ID header, duplicate waiter refusal | `internal/services/transfer/stream.go` |
| Negotiation, transfer execution and receiver verdicts | `internal/services/transfer/run.go` |
| Source hashing and exact-size sending | `internal/services/transfer/send.go` |
| Download destination configuration, root pinning and reserved names | `internal/services/transfer/downloads.go`, `manager.go` |
| Partial receive, full checksum and commit | `internal/services/transfer/receive.go` |
| Throttled progress, average speed and subscriptions | `internal/services/transfer/progress.go` (`Subscribe`) |
| Real-session upload/download, pause, disconnect, cancel and queue tests | `internal/services/transfer/transfer_test.go` |
| Path, partial, duplicate ID, waiter and resume guards | `internal/services/transfer/guard_test.go` |
| Checksum, no-replace commit, byte cap and progress tests | `internal/services/transfer/receive_test.go`, `internal/services/transfer/progress_test.go` |
