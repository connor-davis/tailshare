# Scope brief: remove screen sharing, research what's next

Date: 2026-11-21. Scoped with the owner through goal-assistant.

## Goal

/goal Delete view-only screen sharing from the Tailshare sidecar and desktop app in one connor_davis/* PR into develop, and write one ranked research report in project/research/ on fixes to the app as it is, new UX features and adaptability (from Haiku 5.5 and GPT 6 Luna research of the repo and rival apps); done when task check is green, no screen code, route, tab or doc mention remains, and the owner has the report to pick 0.1.3 items from.

## 1. Objective

- Take out the experimental screen share, which the owner no longer wants in the app for now.
- Find out what the app needs next: fixes to what exists, features that make it nicer to use, and ways to make it work in more setups.

## 2. Scope

In:
- Delete the screen share code completely: `internal/services/screen`, the API routes and sockets in `internal/api/screen.go`, the room handler wiring, Electron capture (`src/main/screen-capture.ts`, the display media handler and IPC channels, preload bridge), `lib/media/screen-*`, `screen-panel.tsx`, the Screen tab, and their tests.
- Update docs that mention it: code map, protocol, security, README, `project/delivery/competitor-bar.md` (the Screen section becomes a non-goal or is removed), and the screen screenshots in `docs/images/screens/`.
- Research with Haiku 5.5 and GPT 6 Luna sub-agents, alternating, at medium effort or lower. They cover three areas:
  - Fixes to the app as it is: gaps, rough edges, unfinished parts.
  - New UX features.
  - Adaptability: other OSes, accessibility, languages, settings, networks.
- Sources: the repo (code, docs, audit, plans) and rival apps (LocalSend, Blip, ngrok, Tailscale and similar).

Out:
- Building any researched item. The owner picks first.
- A stable release. The removal lands on `develop` and ships in its nightly. It reaches stable with 0.1.3.
- Changing the code alphabet, the Argon2 settings or the salt.

## 3. Deliverables

1. PR `connor_davis/remove-screen-share` into `develop`, with a pr-evidence body, merged after its checks pass.
2. `project/research/tailshare-next.md`: one ranked table. Each idea gets:
   - its area (fix, UX or adaptability)
   - what it is
   - its evidence (a file path or a rival's feature)
   - value (high, medium or low)
   - effort (S, M or L)
3. Mapper notes in `mystuff/maps/`.

## 4. Constraints

- Orchestrator V2. Mappers are Haiku 5.5 or GPT 6 Luna, the Developer is Sonnet 5.5 or GPT 6.1 Sol, and every sub-agent runs at medium effort or lower.
- No git worktrees.
- Peer protocol version 2 stays the same. Removing the screen stream kind must not break file sharing or app forwarding with 0.1.2 peers. Older peers that offer screen methods are just ignored.
- No file may run over 900 lines. Every export keeps its doc comment.

## 5. Done when

- `task check` is green.
- `grep -ri screen` finds no screen-share code, route, IPC channel, tab or doc line. Generic words like "screenshot" and "screens/" are fine.
- Room view screenshots are re-shot without the Screen tab, in light and dark.
- The removal PR is merged into `develop` and its nightly is published.
- The research report exists, every row carries evidence, and it is ranked.

## 6. Audience

- The owner, who picks the 0.1.3 items.
- Tailshare users on Windows, who lose the experimental Screen tab.

## 7. Open assumptions (veto any)

- Screen sharing's entry in `docs/protocol.md` is deleted outright, not kept as "reserved". A kind number is never reused.
- Rival research uses public feature pages and forums only.

## 8. User notes captured during scoping

- Removal: "Delete all the code".
- Research covers: fix what exists, new UX features, adaptability.
- Output: a ranked list; the owner picks.
- Sources: the repo plus rival apps.

## Confidence

Objective 90, scope 90, deliverables 90, constraints 85, done-when 85, audience 90.
