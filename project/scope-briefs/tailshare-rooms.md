## Scope Brief: Share rooms layout

> **Goal:**
> `/goal Rebuild the Tailshare desktop app around share rooms: a left sidebar of up to 4 live rooms plus recent rooms, a room view with Files and Chat tabs, a members column and a transfers panel, all in resizable shadcn panels, with tailshare:// join links (max 8 people per room, Polyphron colours, no new servers); done when a nightly build lets 2+ PCs create, link-join, share, chat, leave and reopen a room in light and dark.`

### 1. Objective

Turn Tailshare from "one session with one person" into rooms. You can be in up to
4 rooms at once, each with up to 8 people. A room is created from an empty screen,
shared as a code or a `tailshare://` link, and lives in a sidebar you can switch
between. The layout is three resizable columns (rooms | room | members) with a
transfers panel underneath.

### 2. In scope

- **Left sidebar.** It lists live rooms first (max 4), then recent rooms with a
  Rejoin button. A New room button sits at the top. Your display name and a
  settings gear sit in the bottom-left corner, and clicking the name edits it.
- **Empty state.** When no room is selected, the main area offers Create room
  and Join (type a code or paste a link).
- **Room view.** The header shows the room code with Copy code and Copy link,
  plus Leave. The tabs are **Files** (the share space) and **Chat** (one group
  chat).
- **Members column.** It sits on the right and lists up to 8 people. The host is
  marked. For the host, a pending join shows Allow and Deny.
- **Transfers panel.** It sits at the bottom and shows the current room's
  transfers only, with their status, progress, cancel and retry.
- **Resizable panels.** Every panel resizes and collapses (shadcn Resizable).
  Sizes are saved per computer.
- **`tailshare://join/<CODE>` links.** Windows registers the protocol in the
  installer. Clicking a link opens the app (single instance) and joins. Typed
  codes still work.
- **Several live rooms.** The sidecar runs up to 4 meshes at once. Each room has
  its own roster, chat, share space and transfers. A 5th room asks you to leave
  one first.
- **Recent rooms.** Each entry keeps only the room's name, code and last-seen
  time, stored locally and never with chat. Rejoin tries to join. If nobody
  answers within a few seconds, it asks "This room is empty. Reopen it as
  host?", and one click makes you host on the same code.
- **The 0.1.x work feeds into this.** Mesh admission, share space, save folder
  and sidecar settings land inside the room view instead of the old session
  screen.

### 3. Out of scope

- Web (`https://`) join links, or any server of our own.
- More than 8 people in a room, or more than 4 live rooms.
- Saving chat to disk, including for recent rooms.
- Room passwords, kicking members after they are admitted, and room renaming
  synced across members (the room name is local in v1 of rooms).
- Copying the look of any other app. We copy only the column layout; the
  styling is Tailshare's own (Polyphron colours, shadcn).
- macOS and Linux link handlers. Windows x64 only, as today.

### 4. Deliverables

| Artifact | Location | Notes |
| --- | --- | --- |
| Multi-room sidecar (rooms registry, up to 4 meshes, per-room API and live events) | `internal/services/room` (new) + `internal/api` | Wraps `mesh`, `session`, `transfer` per room |
| Room-aware API and WebSocket events | `internal/api`, `docs/protocol.md` | Every event carries a room id |
| `tailshare://` protocol handler | `src/main` (index/lifecycle), `electron-builder.yml` | Uses the single-instance lock's second-instance event |
| Recent rooms store | `src/main/settings.ts` or a sibling store | Name, code, last seen only |
| App shell: sidebar, empty state, room view, members, transfers | `src/renderer/src/routes/` | shadcn Resizable, Tabs, ScrollArea, Sidebar |
| Docs | `docs/code-map.md`, `DESIGN.md`, `docs/security.md` | Rooms, links, reopen-as-host |

### 5. Constraints

- Tailcat: one code means one set of host keys, so two hosts on one code break.
  That is why reopen asks first, after a join attempt times out.
- Each live room is up to 7 links, so 4 rooms means up to 28 links. Speed limits
  stay global per direction across all rooms.
- The protocol is already at v2. A room id stays local (the sidecar's own id); it
  is not sent on the wire unless needed.
- Branch flow: `connor_davis/*` → `develop` (nightly) → `main` (only when the
  owner says).
- No file over 900 lines. Every path a peer sends stays guarded. Live data goes
  over the WebSocket, never by polling.

### 6. Success criteria (definition of done)

- [ ] On a nightly build: create a room, copy the link, and 2+ PCs join through
      the link (and through the typed code).
- [ ] The host allows and denies joins. The members column shows everyone (up to 8).
- [ ] A file shared in Files downloads on another PC into the save folder.
      The transfers panel shows status and progress for this room.
- [ ] Group chat works in the Chat tab.
- [ ] You are in 2 rooms at once and switch between them without dropping either.
      A 5th room is refused with a plain sentence.
- [ ] Leaving a room moves it to recent. When it is empty, Rejoin offers "Reopen
      as host" and that works.
- [ ] Panels resize and collapse, and the sizes survive a restart.
- [ ] Light and dark both look right. `task check` is green.

### 7. Audience / context

The Tailshare desktop app on Windows: a small group (up to 8) swapping files
directly. It is tested by the owner on nightly builds from `develop`.

### 8. Open assumptions (veto any)

- The room name defaults to the host's name ("Connor's room") and is local only.
- "Reopen as host" makes you the admitter for that code. Earlier members who
  rejoin go through Allow again.
- A recent room is dropped after 30 days, or when you remove it.
- The old two-pane session screen and the folder picker go away when rooms land.
- The Discord-style "activity" and "bots" groups in the reference picture are
  not wanted.

### 9. Confidence (final)

| Area | Score |
| --- | --- |
| Objective | 90 |
| Boundaries | 85 |
| Deliverables | 82 |
| Constraints | 85 |
| Success | 88 |
| Audience | 92 |

### 10. User notes captured during scoping

- "eventually I want to be able to create share rooms etc, so you can like copy a
  link to a room or something or the code, and people can join max 8 people
  right, and the right panel is where the share happens when you are in a room
  otherwise an empty screen that lets you create a new room etc"
- "I like the tabs idea, what about with this screenshot, tabs for shared files
  and chat, and then red is members list, uhm, we also need a panel at the bottom
  that shows the transfers with status etc like we have now, but everything is
  resizeable panels right so users can customize their interface that way"
- On recent rooms: "Option 1 here, but if the room is closed because there is no
  one then me joining makes me the host for that code?" (Answered: ask first,
  then host.)
- Sidebar: "Several live rooms at once". Transfers: "Current room only".
