# Plan: Tailshare v2 (Spaces redesign, all researched features, phone app)

> `/goal Rebuild the Tailshare desktop UI in the owner-picked black "Spaces" design (project/design/spaces-concept.html), build all 26 ideas in project/research/tailshare-next.md, and build a React Native phone app (iOS and Android) on the same Go core via gomobile, in connor_davis/* PRs into develop; done when task check is green on every PR, each phase has light and dark screenshots, and a phone joins a desktop room by code and moves a file both ways. No app store publishing.`

Date: 2026-11-21. Owner decisions are in `mystuff/decisions.md`.

## Owner decisions this plan rests on

- "I want all the features, I also want mobile apps, I also want to rethink the UI/UX".
- Mobile: one shared app, React Native for iOS and Android, with the Go networking through gomobile.
- "We won't do publishing yet". No App Store or Play Store releases. Desktop nightlies and stable releases keep working as today.
- Five interactive concepts were built (`mystuff/design/concepts/`). The owner picked **5 Spaces**, with black instead of navy: "Yes that is sexy".

## The design

- Reference mock: `project/design/spaces-concept.html`. Screenshots: `project/design/spaces-desktop-light.png`, `spaces-phone-dark.png`.
- Black chrome (`#000000`) replaces navy: the left rail, the hero, room card headers, chips and the light focus ring. Orange `#FA7A00` stays the action colour. The canvas stays `#FAF9F6` light and `#0F0F10` dark.
- Home is a board of room cards with live status, seats (up to 8) and a speed sparkline, and the host can Reopen.
- A room is a board of five tiles: Files, People, Apps, Chat and Transfers. Any tile can expand to full view.
- On the phone, the same five tiles become the bottom tabs, in the same order.

## Phases

Each phase is one or more PRs into `develop`. Each PR is mapped, built, reviewed and checked under Orchestrator V2, with a pr-evidence body. Phases A and M0 run side by side.

| # | Phase | Research ideas | Done when |
|---|---|---|---|
| A | **Design system and shell.** Update `DESIGN.md` and `globals.css` to the black tokens. Rebuild the shell: rail, home room cards, room tile board, expandable tiles and the settings layout. The features stay as they are today. | #4 contrast check, part of #10 | Every current flow works in the new layout, light and dark. New screenshots are taken. Contrast pairs pass AA. |
| B | **Fixes to the app as it is.** | #3 code expiry, #5 auto-retry, #13 ask every time, #14 host reopen, #15 clear for good, #16 partial hash, #17 concurrency, #20 batch past 100 | Each has a test. Go changes keep peer protocol 2 working with 0.1.2 peers. |
| C | **Sending and receiving.** | #1 notifications, #2 paste to send, #6 folder send, #7 right-click send, #12 per-room folder, #18 drag out, #19 previews, #24 big folder browsing | Folder send and browsing have path-escape tests. Clipboard reads happen only on click. |
| D | **Trust and connection.** | #11 trusted members, #8 diagnostics, #9 relay region, rest of #10 keyboard and screen reader | Trust binds to the node key and fingerprint, never the name, and can be revoked. The code gate stays. |
| E | **Languages.** | #23 i18n and RTL | Strings are in a catalogue. Arabic renders right to left in the shell. |
| F | **More platforms.** | #21 macOS and Linux, #22 Windows on ARM, #25 portable, #26 headless | CI builds every target as artefacts. The headless use is documented. Unsigned builds are fine. Nothing goes to a store. |
| M0 | **Phone spike.** Build the Go core with gomobile for Android and iOS. Prove that a phone process can join a desktop room by code over Tailcat. | — | A test app on an Android emulator joins a desktop room and lists files. Unknowns are written down: iOS background limits, the Tailcat netstack on mobile, binary size. |
| M1 | **Phone app.** React Native, in a `web/apps/mobile` workspace, in the Spaces design: room cards, join by code or QR, the five tabs, the share sheet "Send to room", and notifications. | phone flows | A phone and a desktop move a file both ways using a code. Light and dark. |

Order after A: B, then C, then D, then E and F. M1 starts once M0 proves the core runs on a phone. A stable desktop release (develop into main) happens after A+B, and again after C+D, when the owner says go.

## Rules that hold in every phase

- No accounts, no servers of our own. Chat stays in memory. Rooms hold up to 8.
- Every path a peer sends is checked against the shared folder, with an escape test.
- Live data goes over the WebSocket, never by polling.
- Peer protocol version 2 stays. Kind 2 stays retired. The code alphabet, the Argon2 settings and the salt don't change.
- No file over 900 lines. Doc comments on every export. Every screen works in light and dark. Words on screen stay plain.
- No git worktrees. Sub-agents run at medium effort or lower, and providers alternate.

## Open choices

- Trusted members (#11). The chosen design shows "Trust this computer" next to Allow and Deny. The plan builds it as opt-in, so "always ask" stays the default. The owner can veto this.
- Phone app name and bundle ids: they wait until publishing comes up.

## Risks

- Tailcat on mobile is unproven. M0 exists to find this out early. If it fails, the fallback is a phone-only client that talks to a desktop over a different path, and that needs an owner decision.
- macOS signing needs an Apple developer account. Phase F ships unsigned builds until the owner decides.
