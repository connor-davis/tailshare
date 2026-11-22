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
| Relay preference, bounded four-region bootstrap race and loser cleanup | `internal/services/session/regions.go`, `host.go` (`selectedRegion`) |
| Per-member path observation cadence and changed-only publication | `internal/services/session/path.go`; `internal/services/mesh/path.go` (authenticated incoming/outgoing link classification) |
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
| Bounded folder import, import-time counts, safe parent creation and reserved top folders | `internal/services/share/import_tree.go` (`ImportTree`, `TreeSummary`, `MakeDirs`, `ReserveFolder`); `import_tree_test.go` (caps, links and escape attempts) |
| Regular-file import, atomic no-replace copy and collision names | `internal/services/share/import.go` (`Import`, `AvailableName`, `NumberedName`); `import_windows.go`, `import_other.go` (link and junction checks) |
| Open the shared folder once (`os.Root`), list, stat, close | `internal/services/share/share.go` (`Open`, `Root`) |
| Peer path rules (slash paths, no `..`, drives, streams, device names) | `internal/services/share/path.go` (`Localize`) |
| Partial-file access, regular-file checks and no-replace link or reserved-name rename publication | `internal/services/share/partial.go` (`PartialSize`, `OpenPartial`, `ReadPartial`, `Commit`, `RemovePartial`) |
| Private partial suffix, bounded peer paths, Windows alias refusal and listing filter | `internal/services/share/path.go` (`PartialSuffix`), `internal/services/share/share.go` (`List`) |
| Confined read and exclusive-create for downloads and uploads | `internal/services/share/files.go` (`OpenRead`, `Create`) |
| Path table, escape, link and junction tests | `internal/services/share/*_test.go` |

## Local API

| Job | Owner |
| --- | --- |
| Error type for the screen (status, stable code, plain sentence) | `internal/platform/apperr/apperr.go` (`Error`, `New`, `BadRequest`, `Internal`) |
| API construction, listener, shutdown, route table, the one state owner | `internal/api/server.go` (`Server`, `New`, `Listen`, `Serve`, `Shutdown`) |
| Main-only next-room relay preference and one-shot connection test | `internal/api/connection.go`; `internal/services/connection/connection.go` (free relay map, netcheck and safe hints) |
| Host, Origin and bearer-token guard, CORS preflight, live-socket handshake check | `internal/api/middleware.go` (`guard`) |
| Service and peer errors to safe API errors, the JSON error handler | `internal/api/errors.go` (`errorHandler`, `toAppError`) |
| Host, join, leave, session state and peer-loss cleanup | `internal/api/session.go` |
| Local admission Allow/Deny routes and pending-ID validation | `internal/api/session_joins.go` |
| Local room and peer folder listing | `internal/api/files.go` |
| Per-room state, active selection, session ownership, the `room` query/body key (`roomFor`), `GET /api/rooms` and `POST /api/rooms/active` | `internal/api/room.go` |
| Canonical room root and per-session manager creation | `internal/api/rooms.go` |
| Main-only header guard, consented file import and downloads root configuration | `internal/api/room_files.go` |
| Main-only folder download, paged peer walk and validated entry names | `internal/api/folder_transfer.go`; `folder_walk_test.go`, `transfer_integration_test.go` (paging, caps, escapes and real nested downloads) |
| Main-only save into a Save-dialog folder (`POST /api/transfers/save`) | `internal/api/save_transfer.go` |
| Chat routes (memory-only history from the peer) | `internal/api/chat.go` |
| Transfer routes, clear (`POST /api/transfers/clear`), main-only limits (`PUT /api/transfers/limits`), the session-owned `Transfers` interface and API DTOs | `internal/api/transfers.go` (`Transfers`, `TransferItem`) |
| Manager adapter, direction/path mapping, state/progress events and subscription recovery | `internal/api/transfer_manager.go` (`managedTransfers`), `internal/api/session.go` (manager lifetime) |
| One event hub, bounded client queues, snapshot-first WebSocket (also `forward.changed`) | `internal/api/live.go` (`hub`, `Event`, `Snapshot`) |
| Shared-app routes, state and live change hook | `internal/api/forwards.go` |
| Session streams: kind byte, reverse path with nonce, per-kind handlers, `Broadcast` | `internal/services/session/streams.go` (`OpenStream`, `HandleStream`, `Broadcast`), `internal/services/mesh/tunnel.go` (`OpenStream`, `AcceptStream`), `internal/services/mesh/link.go` (`S` prefix) |
| Shared apps: list, announce, open, loopback listener, sharer dial, caps | `internal/services/forward/` (`forward.go`, `listen.go`, `pipe.go`), wire types in `internal/services/peer/{stream,forward}.go` |
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
| Explorer send argv, 500 ms batches and current-room send guard | `src/main/send-files.ts`, `send-files.test.ts`; import and chat also check the main-supplied room code in the sidecar |
| Per-user Explorer menu registration and uninstall cleanup | `src/main/explorer-menu.ts`, `build/installer.nsh`, `electron-builder.yml` |
| Folder picker, save-choice routing and folder call timeout tests | `src/main/folder-download.test.ts` |
| Lazy folder pages and loaded-name filtering in the expanded Files tile | `src/renderer/src/lib/api/files.ts`, `routes/-components/room-folder-browser.tsx`, `folder-browse-context.tsx`; `room-folder-browser.test.tsx`, `folder-card.test.tsx` beside them |
| Start with Windows (login item, packaged builds only) | `src/main/login-item.ts` |
| Window options (native Windows caption buttons via `titleBarOverlay`, symbol colour follows the theme), navigation lock and the socket Origin rewrite (`fixSocketOrigin`) | `src/main/window.ts` |
| Window drag strips for the black rail and app toolbar (138 px kept free for native caption buttons) | `src/renderer/src/components/drag-bar.tsx`, `drag-bar.test.tsx` beside it |
| Update available button and dialog with per-version dismissal, shown in the main top bar | `src/renderer/src/components/update-button.tsx`, `update-button.test.tsx` beside it |
| Spaces home hero and saved-room cards; real current membership seats | `src/renderer/src/routes/-components/home-board.tsx`, `empty-state.tsx` |
| Spaces five-tile board, expand/return state and People header join notice | `src/renderer/src/routes/-components/room-view.tsx` |
| Session attachment file collection, file picker/drop and existing download cards | `src/renderer/src/routes/-components/room-files.tsx` |
| Shell pieces: main top bar, empty state, join form and dialog, new-room name dialog, share code with Copy code/Copy link and countdown, name editor | `src/renderer/src/routes/-components/` (`main-bar`, `empty-state`, `join-form`, `join-dialog`, `new-room-dialog`, `share-code`, `code-countdown`, `name-editor`) |
| Update event subscription and initial-read race guard, shared by Settings and the update button | `src/renderer/src/components/use-update-status.ts` |
| Allowlisted Markdown release notes in ScrollArea, guarded GitHub link clicks and explicit Download action, shared by Settings and the update dialog | `src/renderer/src/components/update-release.tsx` |
| `tailshare://join/<CODE>` strict parser, argv scan and the hold-until-ready inbox | `src/main/join-link.ts`, `src/main/join-link.test.ts` |
| Recent rooms store: `recent-rooms.json` in userData, max 20, 30-day prune, atomic write, change listeners | `src/main/recent-rooms.ts`, `src/main/recent-rooms.test.ts` |
| Sidecar supervisor: start, health, restart with backoff, stop (Effect service and layer) | `src/main/sidecar.ts` |
| Room file IPC (a big drop is cut into 100-path calls), the `startDownload` Save dialog ("Ask every time"), canonical folder opening and main-only HTTP calls | `src/main/room-ipc.ts` (`registerRoomIpc`, `roomFolder`, `callMainApi`) |
| Relay preference sent after ready and on change | `src/main/relay-region.ts`; `src/renderer/src/components/settings/connection-section.tsx` (region selector and one-shot test) |
| Transfer count and speed caps sent to the sidecar after ready and on change | `src/main/limits.ts` (`createLimits`), `limits.test.ts` |
| Real sidecar process (spawn, both tokens, room storage env, stdin pipe) | `src/main/sidecar-process.ts` |
| Ready-line parsing with a size bound | `src/main/ready-line.ts` |
| Health check call | `src/main/health.ts` |
| Save folder applied after ready; a bad folder turns downloads off, never the engine (status get/push) | `src/main/downloads.ts`, `src/renderer/src/components/use-downloads-status.ts`, `src/renderer/src/routes/-components/downloads-alert.tsx` |
| Current room kept in main so a reloaded page finds its code (`getCurrentRoom`/`setCurrentRoom`) | `src/main/room-ipc.ts` |
| Sidecar binary path (dev `bin/`, packaged resources) | `src/main/config.ts` |
| IPC handlers: sender check, schema checks, folder dialog, recent rooms get/touch/remove | `src/main/ipc.ts` |
| IPC channel names and payload schemas | `src/shared/ipc-schema.ts` |
| Typed bridge (`window.tailshare`, incl. `onJoinLink`, recent rooms calls and events) and its browser declaration | `src/preload/index.ts`, `src/shared/bridge.ts`, `src/renderer/src/types/desktop.d.ts` |
| Desktop tests (`task test:web`; `@` alias for tests) | `src/**/*.test.ts(x)` (vitest), `vitest.config.ts` |
| Renderer entry and Content Security Policy | `src/renderer/index.html` |
| Query client and hash router | `src/renderer/src/main.tsx` |
| Root outlet, live socket start, sidecar banner, announcements | `src/renderer/src/routes/__root.tsx`, `src/renderer/src/components/sidecar-banner.tsx`, `src/renderer/src/components/status-region.tsx` |
| Spaces shell: black room rail (New room, Join, search), home board, room board and heading; rail visibility saved; retired member/transfer and size preferences ignored | `src/renderer/src/routes/index.tsx`, `src/renderer/src/routes/-components/` (`room-sidebar`, `room-view`, `room-header`, `room-chat`, `members-panel`, `transfers-panel`, `panel-layout.ts`, `recent-rooms.ts`) |
| Local join prompt, pending/error state and Allow/Deny actions | `src/renderer/src/routes/-components/join-request.tsx`, `join-request.test.tsx` beside it |
| Code typing, folding and display (mirrors `codes.Parse`) | `src/renderer/src/lib/code-input.ts` |
| Byte, speed, time and date text | `src/renderer/src/lib/format.ts` |
| Local API client, open-room list, active selection, query keys, hooks and types (match `internal/api`); `room-cache.ts` resets room data on selection | `src/renderer/src/lib/api/` |
| One live socket, seq ordering, reconnect, cache updates | `src/renderer/src/lib/live/` |
| Chat composer (Enter sends, grows to 8 lines, Add files button) and file card (Download, progress, Saved) | `src/renderer/src/routes/-components/` (`chat-composer.tsx`, `file-card.tsx`) |
| Adding files from the button or a drop, one chat message per file | `src/renderer/src/routes/-components/use-share-files.ts` (calls `window.tailshare.addFiles` and `addDroppedFiles`) |
| Apps tab: shared apps list, Share dialog, Open, Copy, Open in browser | `src/renderer/src/routes/-components/` (`apps-panel.tsx`, `share-app-dialog.tsx`), `src/renderer/src/lib/api/forwards.ts` |
| Open-in-browser link check (`isForwardLink`) and its main-process handler | `src/shared/bridge.ts`, `src/main/ipc.ts` (`openForwardLink`) |
| Windows toasts (text built in main, setting and window guard) | `src/main/notify.ts` (renderer asks from `src/renderer/src/lib/live/apply.ts`) |
| Finished-download memory: drag a file out, preview a saved file (id to folder, capped at 200) | `src/main/saved-downloads.ts` |
| Paste to send (clipboard read in main, temp file under `userData/paste`) and the per-room save folder | `src/main/room-ipc.ts`; folder kept in `src/main/recent-rooms.ts` (`setFolder`, `folderFor`) |
| Paste button, room save folder button, file preview on cards | `routes/-components/chat-composer.tsx`, `room-save-folder.tsx`, `file-preview.tsx`, `file-card.tsx`; hooks in `lib/api/preview.ts` |
| Local preview of a shared or saved file (images up to 256 KB, 2 KB of text; no SVG or HTML) | `internal/api/preview.go` |
| Transfer row (the only piece left in `session/`) | `src/renderer/src/routes/session/-components/transfer-row.tsx` |
| Generated route tree (router plugin owns it) | `src/renderer/src/routeTree.gen.ts` |
| shadcn generation and class utility | `components.json`, `src/renderer/src/lib/utils.ts` |
| Shared UI primitives (shadcn) | `src/renderer/src/components/ui/` (`alert.tsx`, `breadcrumb.tsx`, `button.tsx`, `card.tsx`, `empty.tsx`, `context-menu.tsx`, `field.tsx`, `input.tsx`, `label.tsx`, `progress.tsx`, `radio-group.tsx`, `resizable.tsx`, `scroll-area.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `skeleton.tsx`, `switch.tsx`, `table.tsx`, `tabs.tsx`, `textarea.tsx`, `badge.tsx`, `tooltip.tsx`; added with shadcn CLI 4.23.0) |
| Design rules and light/dark semantic tokens | root `DESIGN.md`, `src/renderer/src/styles/globals.css` |

## Transfers

Folder downloads reserve one new top folder, create parents inside the pinned root, and queue ordinary file downloads in `internal/services/transfer/folder.go` (`DownloadTree`, `TreeFile`), covered by `folder_test.go`.

| Job | Owner |
| --- | --- |
| Transfer states, snapshots, events and ID validation | `internal/services/transfer/transfer.go` (`State`, `Transfer`, `Event`) |
| Queue, shared slots (`SetSlots`), pause, cancel, resume and lifetime | `internal/services/transfer/manager.go` (`Manager`, `New`, `Attach`, `Done`) |
| Automatic retry, slot count and clearing finished rows | `internal/services/transfer/retry.go` (`planRetryLocked`, `SetSlots`, `Forget`) |
| Upload and download speed caps | `internal/services/transfer/limit.go` (`SetLimits`) |
| Offer and download-resume checks, duplicate offer refusal | `internal/services/transfer/offer.go` |
| Data streams, bounded ID header, duplicate waiter refusal | `internal/services/transfer/stream.go` |
| Negotiation, transfer execution and receiver verdicts | `internal/services/transfer/run.go` |
| Source hashing and exact-size sending | `internal/services/transfer/send.go` |
| Download destination configuration, root pinning and reserved names | `internal/services/transfer/downloads.go`, `manager.go` |
| Partial receive, prefix checkpoint check on resume, full checksum and commit | `internal/services/transfer/receive.go` (`checkPrefix`, `saveCheckpoint`), `internal/services/share/partial_policy.go` (`SavePartialPrefix`, `PartialPrefix`) |
| Throttled progress, average speed and subscriptions | `internal/services/transfer/progress.go` (`Subscribe`) |
| Real-session upload/download, pause, disconnect, cancel and queue tests | `internal/services/transfer/transfer_test.go` |
| Path, partial, duplicate ID, waiter and resume guards | `internal/services/transfer/guard_test.go` |
| Checksum, no-replace commit, byte cap and progress tests | `internal/services/transfer/receive_test.go`, `internal/services/transfer/progress_test.go` |

## Backend audit guards

| Job | Owner |
| --- | --- |
| Partial sender/hash/size ownership, partial quota and seven-day room cleanup | `internal/services/share/partial_policy.go` |
| Available disk bytes for the current user | `internal/services/share/space_windows.go`, `space_other.go` (`FreeSpace`) |
| Two-second directory listing cache and download-folder identity | `internal/services/share/share.go` (`List`, `SameFolder`) |
| Incremental frame body reads and authenticated handler conversation | `internal/services/peer/frame.go`, `peer.go`, `dispatch.go` (`Conversation`, `MemberID`) |
| Stable short public-key label and optional removed-members admission response | `internal/services/peer/share.go` (`Fingerprint`, `ShareLinksResult`) |
| Concurrent bounded prefix routing and one pending control per member | `internal/services/mesh/link.go` (`Accept`, `routeStream`) |
| Join stream cap, deny backoff, pending fingerprint and expiry after a linked member | `internal/services/session/host.go`, `admission.go`, `mesh.go` |
| Admitter-only member removal route and replacement transfer manager | `internal/api/session_members.go`; `internal/services/session/mesh.go` (`RemoveMember`, `SetHandlers`) |
| Trusted key set (validated, capped at 100) and the admission skip for an exact trusted key | `internal/services/session/trusted.go` (`Trusted`), `admission.go` (`allowLocked`, `PendingKey`) |
| Main-only trusted list and pending-join key routes | `internal/api/session_trusted.go` |
| Stable joiner key from `TAILSHARE_IDENTITY`, checked at load | `internal/platform/config/config.go` (`IdentityKey`), `internal/services/session/join.go` |
| Per-install join key file (`identity.key`, never in settings or IPC) | `web/apps/desktop/src/main/identity.ts` |
| Trusted computers: save, push, `trustJoin`, `revokeTrusted` | `web/apps/desktop/src/main/trusted.ts` (`createTrusted`, `registerTrustedIpc`) |
| Trust button on a join request | `web/apps/desktop/src/renderer/src/routes/-components/join-request.tsx`; `lib/api/session.ts` (`useTrustJoin`) |
| Trusted computers list in Settings | `web/apps/desktop/src/renderer/src/components/settings/trusted-section.tsx` |
| Attached-conversation transfer authorization, offer rate and refusal cleanup | `internal/services/transfer/offer.go` |
| Cancellable source/partial hashes and size-scaled download offer deadline | `internal/services/transfer/send.go`, `receive.go`, `run.go` |
| Terminal history cap and pinned download-root introspection | `internal/services/transfer/run.go`, `downloads.go` (`PinsRoot`) |
| Backend audit regressions, offline network abuse checks and actual Windows short alias | `internal/services/{share,peer,mesh,session,transfer}/audit*_test.go`, `internal/api/audit_test.go` |

## Phone (Android, built in CI)

| Job | Owner |
| --- | --- |
| gomobile facade: join by code, wait for host approval, list the host's shared folder as JSON, leave (every path through `share.Localize` and `peer.List`) | `mobile/tailshare/client.go` (`Client`, `NewClient`) |
| Offline facade tests on the local relay (join, list, bad paths, cancel) | `mobile/tailshare/client_test.go` |
| Build the Go library and the APK (CI only, never in `check`) | `Taskfile.yml` (`mobile:aar`, `mobile:apk`) |
| Android build, unsigned PR artifact, signing and release upload (reusable, not a required check) | `.github/workflows/android.yml`; called from `nightly.yml` and `release.yml` |
| Expo app, version name and code from CI env, `applicationId connor.davis.tailshare` | `web/apps/mobile/app.config.ts`, `App.tsx` |
| Phone strings (one catalog) and Polyphron light/dark colours | `web/apps/mobile/src/strings.ts`, `src/theme.ts` |
| JS side and Kotlin bridge to the Go library | `web/apps/mobile/modules/tailshare-core/` (`index.ts`, `android/.../TailshareCoreModule.kt`) |

## Desktop language catalogs

Paths below are under `web/apps/desktop/src/`.

| Job                                                                                                        | Owner                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Supported language values, OS locale normalization, typed interpolation and Intl cardinal plural selection | `shared/i18n.ts`; `shared/i18n.test.ts`                                                              |
| English UI source catalog, current locale and non-React translator                                         | `renderer/src/i18n/en.ts`, `renderer/src/i18n/index.ts`                                              |
| Settings-backed locale subscription and React locale/translation hooks                                     | `renderer/src/i18n/provider.tsx`; `provider.test.tsx`                                                |
| Native tray, toast, Explorer, dialog and safe IPC English catalog                                          | `main/i18n/en.ts`, `main/i18n/index.ts`; settings startup and native menu refresh in `main/index.ts` |
| Five-language picker with native language names in Settings > App                                                             | `renderer/src/components/settings/settings-language.tsx`                                             |
| Stable API error code to catalog key mapping, with English fallback for unknown or coarse codes            | `renderer/src/lib/api/error-message.ts`; `error-message.test.ts`                                     |
| Shipped Spanish, French, German and Arabic renderer/main catalogs | `renderer/src/i18n/{es,fr,de,ar,catalogs}.ts`, `main/i18n/{es,fr,de,ar,catalogs}.ts` |
| Exact catalog keys, placeholders and Intl plural categories | `shared/catalog-validation.ts`; `shared/catalogs.test.ts`, `renderer/src/i18n/catalogs.test.ts`, `main/i18n/catalogs.test.ts` |
| Development-only en-XA expansion and key-screen extraction checks | `shared/pseudo-locale.ts`; `renderer/src/i18n/pseudo.test.tsx` |
| JSX text and accessible string extraction guard | `renderer/src/i18n/hardcoded.test.ts` |
| Live language selection, native menu and notification translations | `renderer/src/components/settings/settings-language.test.tsx`, `renderer/src/i18n/provider.test.tsx`, `main/i18n/native-language.test.ts` |

## Platform packaging

| Job | Owner |
| --- | --- |
| Parameterised sidecar/package OS, architecture, targets and Windows feed names | `Taskfile.yml` (`dist`), `web/apps/desktop/electron-builder.yml` |
| Non-required Linux/macOS Go tests and Windows-hosted cross-compile gates | `.github/workflows/platforms.yml` |
| Linux AppImage and unsigned macOS dmg builds, attached to the release the Windows job made | `.github/workflows/desktop-unix.yml` (called by `nightly.yml`, `release.yml`); `linux:` and `mac:` in `electron-builder.yml` |
| macOS update switch-off (reason `unsigned`) and its releases-page copy | `updater.ts`, `updates-card.tsx`; tests in `updater.test.ts`, `updates-card.test.tsx` |
| Per-OS window frame (system frame off Windows) and the Explorer-menu Windows guard | `web/apps/desktop/src/main/window.ts`, `explorer-menu.ts` |
| Running the sidecar alone: host and join by code over the local API, stdin-open rule | [headless.md](headless.md); `cmd/tailshare/serve_test.go` |
| ARM64 GitHub update manifest selection preserving nightly tag matching; x64 uses upstream provider | `web/apps/desktop/src/main/update-provider.ts`; integration tests in `updater.test.ts` |
| Portable launcher detection, adjacent `Tailshare Data` path and room-protocol registration guard | `web/apps/desktop/src/main/portable.ts`, `portable.test.ts`; login/Explorer guards in their existing owners |
