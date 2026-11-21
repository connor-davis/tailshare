# What Tailshare needs next

Date: 2026-11-21. This is the input for picking 0.1.3 items. Nothing here is built yet.

## Where it came from

- Brief: `project/scope-briefs/remove-screen-and-research.md`.
- Three research passes, each with evidence (a file:line or a public page):
  - Fixes to the app as it is: GPT 6 Luna, notes in `mystuff/maps/research-fixes.md`.
  - New UX features from rival apps: Haiku 5.5, notes in `mystuff/maps/research-ux.md`.
  - Adaptability (platforms, networks, accessibility, languages): GPT 6 Luna, notes in `mystuff/maps/research-adapt.md`.
- The Orchestrator merged the passes, spot-checked claims against the code and ranked them.
- Screen sharing is excluded. It is being removed.

How to read the ranking:

- **Value:** how much it helps users. High, Med or Low.
- **Effort:** S is a day or less, M is a few days, L is a week or more.
- **Rank:** high value and low effort come first, and fixes to the existing app come before new surface.

## Ranked list

| # | Idea | Area | What it is | Evidence | Value | Effort |
|---|---|---|---|---|---|---|
| 1 | Windows notifications | UX | A toast when someone asks to join, and when a transfer finishes or fails, while the window is hidden. Peer names are bounded, never raw. | No `Notification` use anywhere in `web/apps/desktop/src`. Join requests time out unseen. LocalSend runs in the background and notifies. | High | S |
| 2 | Paste to send | UX | A Paste button in chat. Text becomes a message and an image becomes a file card. It reads the clipboard only on click. | Only the room code can be copied today (`share-code.tsx`). Asked for in LocalSend #1718 and PairDrop discussion #136. | Med-high | S |
| 3 | Real code expiry after reload | Fix | The sidecar sends `expiresAt`, so the countdown survives a reload. | `code-countdown.tsx:20` (ponytail). Today it shows "within 10 minutes". | Med | S |
| 4 | Contrast and non-colour status check | Adapt | Check every colour pair against WCAG AA in light and dark, and make sure status is never shown by colour alone. | `styles/globals.css:8-49`. The status dot in `room-sidebar.tsx:57`. | High | S |
| 5 | Auto-retry transient transfer failures | Fix | Retry a dropped transfer a few times with backoff before marking it failed. | `internal/services/transfer/manager.go:311` (ponytail: retries are manual). | Med | M |
| 6 | Folder send | Fix | Drop a folder and its whole tree is sent, with every path checked against escape. | Folders are skipped: `internal/api/room_files.go:42-50`, `competitor-bar.md:17`. Blip and LocalSend send folders. | High | L |
| 7 | "Send with Tailshare" in the right-click menu | UX | Right-click a file in Explorer and it lands in the open room. Uses per-user registry keys, so no admin is needed. | Taildrop has exactly this on Windows. Today it is drag or the + button only. | High | M |
| 8 | Connection diagnostics | Adapt | Show direct or relay status, firewall or UDP-blocked hints, captive-portal guidance and a "test my connection" button. | `internal/services/session/join.go:34-40,136`. The firewall note in the desktop README. | High | M |
| 9 | Relay region choice in Settings | Adapt | Pick NYC, SFO, FRA or TOK (or "nearest") instead of the fixed FRA default. Both sides must agree. | `internal/platform/config/config.go:32-38,53-60` (env var only today). | High | M |
| 10 | Keyboard and screen-reader pass | Adapt | Walk every flow keyboard-only. Label icon buttons. Announce transfer, chat and member changes. Add reduced motion. | Partial labels in `room-sidebar.tsx`, `transfer-row.tsx:52`. No `prefers-reduced-motion` in `globals.css`. | High | M |
| 11 | Trusted members skip Allow | UX | Opt in per member. Trust binds to the node key and fingerprint, never the name, and can be revoked. The code gate stays. **Owner choice:** this, or keep "always ask". | Every join needs Allow today (`internal/services/session/admission.go`). LocalSend favourites auto-accept. | Med-high | M |
| 12 | Per-room save folder | Adapt | Each room can save to its own folder. | A single `saveFolder` in `main/settings.ts`. | High | M |
| 13 | "Ask every time" save mode | Fix | Bring back the per-file save dialog that settings already store. | `settings-fields.tsx:127`, `main/index.ts:119` (ponytail). | Med | M |
| 14 | Host can reopen a recent room | Fix | The host restarts a recent room from the list without making a new one. | `room-sidebar.tsx:117-120`. | Med | M |
| 15 | Clear transfers for good | Fix | Clear removes finished rows in the sidecar too, so they don't come back after a reload. | `transfers-panel.tsx:50-58` (it only hides rows locally). | Med | M |
| 16 | Check the partial file before resuming | Fix | Hash the partial prefix before trusting its size, so a corrupt partial fails fast. | `internal/services/transfer/receive.go:49` (ponytail), `docs/security.md:220-222`. | Med | M |
| 17 | Transfer concurrency setting | Adapt | Let users set 1 to 4 transfers at once. There is a fixed cap of 2 today. | `internal/services/transfer/manager.go:19-20`. Speed limits already exist. | Med | S |
| 18 | Drag a received file out to Explorer | UX | Drag a downloaded row onto the desktop. | Weak evidence: no rival thread found. Electron supports `startDrag`. | Med | M |
| 19 | Previews on file cards | UX | A small image thumbnail or the first lines of a text file, capped in bytes. | WeTransfer marketing only (weak). | Med | M |
| 20 | Batch past 100 files per send | Fix | Split a big drop into batches instead of failing. | `internal/api/room_files.go:22-28`. | Low | S |
| 21 | macOS and Linux builds | Adapt | A release matrix, mac signing and notarising, Linux AppImage or deb, and a plain title bar instead of Mica. | Builds are Windows-only: `electron-builder.yml:14-15,24-29`, every workflow is `windows-latest`. The Go side is mostly portable (`share/*_other.go`). | High | L |
| 22 | Windows on ARM build | Adapt | Ship an arm64 installer and sidecar. | `electron-builder.yml:25-29` (x64 only). | Med | M |
| 23 | Languages (i18n) and RTL | Adapt | Pull strings into a catalogue first, then translate. Use logical CSS for right-to-left languages. | All strings are inline (`new-room-dialog.tsx`, `room-sidebar.tsx`). | High | L |
| 24 | Big folder browsing | Adapt | Lazy tree loading, search and filter for huge shared folders. | `internal/api/files.go:13-30` (pages of 100). | Med | M |
| 25 | Portable build | Adapt | A no-install `.exe` for USB sticks and locked-down PCs. | Only NSIS is configured: `electron-builder.yml:24-40`. | Med | M |
| 26 | Documented headless sidecar | Adapt | Supported CLI use of `tailshare serve` for automation. | `cmd/tailshare`, `docs/start-here.md`. | Low-med | M |

## Checked and dropped

- **Minimise to tray:** already built. `main/lifecycle.ts:12` hides on close when `closeToTray` is on.
- **Pause, resume, speed limits, start at sign-in, recent rooms:** already built.
- **Background clipboard sync:** rejected, because it reads everything you copy.
- **QR join:** low value while there is no phone app.
- **Rooms bigger than 8:** needs a different network shape, not a bigger number. Not for 0.1.3.
- **Corporate HTTP proxy, IPv6-only, LAN-only mode:** test what Tailcat v0.7.0 does on these networks before promising anything.

## Suggested 0.1.3 picks

If you want a small, solid 0.1.3:

1. Notifications (#1)
2. Paste to send (#2)
3. Real code expiry (#3)
4. Contrast check (#4)
5. Auto-retry (#5)
6. Folder send (#6)

These are mostly S and M work on the Windows app as it is, plus the one big gap users notice: folders.

Leave macOS and Linux (#21) and languages (#23) for their own release. Each is a week or more of work.

## Open choices for the owner

- Trusted members (#11): key-bound trust, or always ask.
- Which items go into 0.1.3.

## Not verified

- The UX research could not reach Reddit or see GitHub vote counts. Rows marked weak are judgement, not cited demand.
- The accessibility findings come from reading the source. No real screen reader was used.
- The network findings are about what to test, not claims that Tailcat fails.
