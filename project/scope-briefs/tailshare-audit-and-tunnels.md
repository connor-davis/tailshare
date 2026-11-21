## Scope Brief: Audit plus app and screen sharing

> **Goal:**
> `/goal Audit and fix every bug, security hole and UI/UX issue in the Tailshare Go sidecar and Electron desktop app, and add room-scoped TCP port forwarding (share localhost:PORT, a member opens it on their own localhost) and view-only screen/window sharing over the existing Tailcat tunnel, landed as stacked connor_davis/* PRs into develop (no remote control, no servers of our own); done when task check is green, every screen has light and dark screenshots, two PCs prove a shared local web server and a live screen share through the tunnel, and a written competitor table shows Tailshare matching or beating LocalSend/Blip, ngrok/Tailscale and Parsec/AnyDesk on their core features.`

### 1. Objective

Make Tailshare the best-working and best-looking tunneled sharing app. Today it
shares files and chat in rooms. After this it also shares local apps and servers
(port forwarding) and screens (view only), and the whole app is audited: real
bugs, security holes and UI/UX issues found and fixed.

### 2. In scope

- **Audit, backend.** `cmd/tailshare`, `internal/api`, `internal/services/*`
  (codes, session, mesh, peer, share, transfer), `internal/platform`. Bugs, races,
  leaks, error handling, path guard, token checks, join approval, resource limits.
- **Audit, frontend.** `web/apps/desktop` main, preload and renderer: IPC
  surface, Electron hardening (contextIsolation, sandbox, CSP, navigation,
  `tailshare://` handling), state bugs, empty/loading/error states, accessibility
  basics, light and dark.
- **Fix it all.** Every confirmed finding gets fixed, with a test where one can
  run. Security fixes get a test that tries the attack.
- **Port forwarding.** In a room, a member picks a local TCP port to share (e.g.
  `localhost:3000`), with a label. Other members see it in the room and click
  Open: their sidecar listens on a local port (on `127.0.0.1` only) and pipes to
  the sharer through the tunnel. Works for any TCP service: web apps, databases,
  game servers, SSH. Sharer can stop it at any time. Live state over the
  WebSocket.
- **Screen sharing, view only.** A member shares a whole screen or one window
  (Electron `desktopCapturer`). Others watch live in the room. No mouse or
  keyboard control. Media rides the Tailcat tunnel (no third-party TURN/STUN).
- **UI/UX polish.** Brand-true, modern, consistent across all screens, both
  themes. New Apps and Screen surfaces in the room view.
- **Competitor bar.** A written table of core features of LocalSend/Blip (files),
  ngrok/Tailscale (ports) and Parsec/AnyDesk (screen), with where Tailshare
  matches, beats, or deliberately skips each one.

### 3. Out of scope

- Remote control (mouse/keyboard) in screen share.
- Public URLs for a shared port (ngrok-style internet exposure). Shared ports
  are reachable only by room members.
- UDP forwarding.
- Own relay servers, accounts, macOS/Linux builds, code signing.
- Audio in screen share.
- Changing the code alphabet, Argon2 settings or salt in `internal/services/codes`.

### 4. Deliverables

| Artifact | Location | Notes |
|----------|----------|-------|
| Audit findings | `project/delivery/audit-2026-11.md` | Each finding: area, severity, proof, fix PR |
| PR 1: audit fixes, backend + security | `connor_davis/audit-fixes` | Go fixes + attack tests |
| PR 2: port forwarding | `connor_davis/port-forward` | New `internal/services/forward`, API routes, peer protocol frames, UI, tests; plus audit fixes in what it touches |
| PR 3: screen share | `connor_davis/screen-share` | Capture in main, signalling over the peer protocol, viewer UI |
| PR 4: UI/UX polish | `connor_davis/ui-polish` | Remaining frontend findings, light + dark screenshots |
| Competitor table | `project/delivery/competitor-bar.md` | Feature-by-feature |
| Docs | `docs/protocol.md`, `docs/security.md`, `docs/code-map.md` | New frames, new trust surface, new owners |
| Two-PC proof | `project/delivery/` | Shared web server + screen share, with screenshots |

### 5. Constraints

- Follow `AGENTS.md`: Orchestrator V2 roles, mapper before developer, sub-agents
  at medium effort or lower, round robin Claude/GPT, no worktrees, PRs with
  pr-evidence bodies, owner merges.
- No polling; live data over the WebSocket.
- Shared ports are opt-in per port by the sharer. Forwarded listeners bind
  `127.0.0.1` only. A peer can only reach ports the sharer listed, never an
  arbitrary host or port.
- Screen share starts only by explicit user action and shows a clear "you are
  sharing" indicator with a stop button.
- No file over 900 lines; doc comments on every export; Polyphron colours.
- Go tests stay offline (local DERP); the live relay test stays behind
  `task test:net`.

### 6. Success criteria

- [ ] `task check` green on every PR.
- [ ] Audit findings file lists every finding with its fix or a written reason
      it was not a real issue.
- [ ] Every security fix has a test that tries the attack and fails.
- [ ] A test shows a peer cannot reach a port the sharer did not list.
- [ ] Two PCs: PC A shares a local web server, PC B opens it in a browser via
      Tailshare, recorded with screenshots.
- [ ] Two PCs: PC A shares a window, PC B watches it live, recorded.
- [ ] Light and dark screenshots of every screen, including new Apps and Screen
      views.
- [ ] Competitor table written; every "core feature" row is matched, beaten or
      marked as a deliberate non-goal with a reason.

### 7. Audience / context

Tailshare desktop app users on Windows: small teams and friends sharing files,
dev servers and screens in rooms of up to 8 people, joined by code or
`tailshare://` link.

### 8. Open assumptions

- Port forwarding is room-scoped: every member of the room can open a shared
  port. A per-member allow list is not in v1 of this feature.
- Screen share media goes over the tunnel via WebRTC with the peer protocol
  carrying signalling, or a simpler frame stream if WebRTC over the tunnel
  proves unworkable. The PR 3 mapper picks; the decision goes in
  `mystuff/decisions.md`.
- Audit PR 1 lands first; PRs 2 and 3 can run side by side; PR 4 is last.

### 9. Confidence (final)

| Area | Score |
|------|-------|
| Objective | 85 |
| Boundaries | 85 |
| Deliverables | 85 |
| Constraints | 90 |
| Success | 85 |
| Audience | 80 |

### 10. User notes captured during scoping

- Order: "I want the new features etc and the audit to be hand in hand"
- App share: "Port forwarding + screen sharing doesnt sound too bad"
- Screen share: view only. Shipping: stacked PRs by area.
- Rivals: LocalSend / Blip, ngrok / Tailscale, Parsec / AnyDesk.
