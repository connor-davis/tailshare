# Security: short share codes

## How an 8-character code connects two machines ("seeded keys")

A Tailcat address holds a random node key and a random pre-shared key. That
makes it about 100 characters long, and random data cannot be compressed. So
Tailshare does not shrink the address. Both sides grow it back from the code:

1. The host makes a random code, such as `7K3Q-9PXM` (Crockford base32, 40 bits).
2. Argon2id (time 3, 64 MiB, 4 threads, fixed salt) stretches the code into 64
   bytes: a node private key and a WireGuard pre-shared key.
3. The host runs a Tailcat server with those keys on the home relay region.
4. The joiner runs the same derive and builds the host's address
   (`codes.Addr`). The long address is never sent anywhere.

Code: `internal/services/codes`.

## Spike result (2026-11-19)

`TestSeededKeysConnect` passed against Tailcat's free relays (region 303,
Frankfurt). A host listened with code-derived keys, and a joiner that knew
only the code connected and read data in about 3 seconds. Seeded keys work,
so no code-desk server is needed.

Run it with: `TAILSHARE_NET=1 go test -run SeededKeys ./internal/services/codes`

## The risk we accept, and how we limit it

40 bits is guessable offline. Anyone who sees the host's public key can try
every code until one derives that key. The relay operator sees it, and
Tailcat's free relays keep metadata logs. That attacker would then hold the
pre-shared key and could request to join.

Limits, all required:

- **Slow derive.** Argon2id with 64 MiB makes each guess cost real memory and
  time. Eight base32 characters give 32^8 = 2^40 possible codes
  (1,099,511,627,776), 1,024 times the six-character space. The Argon2 cost
  per guess is unchanged; parallel hardware can still search faster.
- **Local approval.** The code server stays reachable while the share lives,
  with no Tailcat allowlist. Knowing the code permits asking to join, not
  accessing files. The authenticated stream key must match the join line.
  Hello supplies a display-only name; Allow or Deny is a local action. The
  prompt expires after 60 seconds. One prompt or preparation is active at a
  time, and the share holds at most eight members. Four bootstrap streams may
  be held at once. Denied authenticated client keys and claimed mesh identities
  wait 60 seconds before retrying (a bounded 256-key table). Busy refusals close
  after a 100 ms reply grace, rather than the preparation backstop. Prompts show
  a twelve-hex-character fingerprint of the authenticated client public key.
- **Unused-code expiry.** A code expires ten minutes after it is shown unless
  someone is allowed. Pending and denied requests do not stop expiry. The
  first registered mesh control stream stops expiry for the remainder of the share.
- **Independent links.** Every member has a fresh random mesh server and a
  fresh random client key for each outgoing link. Mesh starts with only its
  own key allowlisted; admission adds expected link keys. Every stream is
  checked against both its authenticated source and current membership.
  Tailcat cannot remove allowlisted clients, so leave closes their streams
  and the application roster refuses new streams from removed members.
- **Takeover limits.** The lowest surviving join order admits. A clean leave
  permits immediate takeover; loss waits fifteen seconds after the local
  control stream reports it. This delay does not detect an unreachable host.
  A network split
  can leave two live servers using the same code key, and pairwise loss can
  leave rosters inconsistent at a third member. Version 1 has no roster
  resync. The session service keeps the code in memory until the share ends,
  so a survivor can start the same code server. Desktop recent rooms and room
  directory names persist codes locally; neither service logs them.
- **Member trust.** Rosters and admission messages distribute each member's
  Tailcat address, including its pre-shared key, to other admitted members.
  The address is not a secret from the share. The authenticated link key,
  expected-key table and current roster are still checked on every stream.
- **Own relay later.** Moving to a self-hosted DERP relay removes the
  third-party operator from the threat.

## Region

The relay region is not secret and is not in the code. Both peers use the
app's home region (default 303, Frankfurt). Tailcat's free relays are 301 NYC,
302 SFO, 303 FRA and 304 TOK. The bootstrap goes through the relay, then
Tailcat upgrades to a direct link when NAT allows.

## Shared folders

`os.Root` is the guard. The shared folder is opened once with `os.OpenRoot`,
and every peer path goes through that handle (`internal/services/share`). The
check and the open are one step, so there is no gap to race. Peer paths are
also checked in words first (`share.Localize`), because the protocol is
stricter than any one OS: slash paths only, no `..`, no absolute paths, no
drive letters, at most 4096 bytes total and 255 bytes per component, no colon (this also blocks NTFS streams), no backslash or NUL
or control characters, and no Windows device names (`CON`, `NUL`, `COM1` and
the rest, with any extension). A bad path is refused, never cleaned up into a
good one. Windows refuses `~` followed by a digit in a component to block
short-name aliases of private files. Uploads create a new file only and never
overwrite. Listing pages reuse a two-second cache (128 directories maximum),
with directory modification time checked before reuse.

What `os.Root` covers:

- `..` and symlinks or Windows junctions that point outside the folder. A
  link that stays inside is allowed. Escaping links are hidden from listings.
- Read, stat, list and create, all tested with a link and a junction pointing
  out (the outside file is checked untouched). Windows holds the root open, so
  the folder cannot be renamed or deleted while sharing.

What it does not cover:

- Mount points or bind mounts inside the folder are followed. Device files
  on Unix are not blocked.
- A junction whose last part is the link itself, in the changing calls
  (`Mkdir`, `MkdirAll`), was a Go bug fixed in Go 1.27.2. We use 1.27.4. Keep
  the Go version current, and test any new changing call we add.
- Room folders live under `<userData>/rooms/<CODE>`. The code is parsed and
  canonicalized before a confined child root is created or reopened. Leave closes
  the handle after workers stop; files persist and are shared again when that code
  is reused. Local programs can still change these trusted files while we read.
- Names and sizes are shown to the other computer as they are.

## Desktop shell

The Electron main process starts the Go sidecar and is the only place that
owns its address and tokens. The normal API token is given to the renderer;
the main-only token stays in main.

- The window has context isolation and the sandbox on and Node off. It refuses
  every new window, navigation, redirect and webview. `window.tailshare` is the
  only interface the page can reach. It includes `addFiles`, `addDroppedFiles`
  and `openRoomFolder`; no `ipcRenderer` or generic invoke is exposed.
- Each IPC handler checks that the call came from our window, refuses extra
  arguments, and checks its reply with an `effect/Schema` schema before it
  leaves main. A folder path is only ever returned from the native dialog.
- Windows draws the minimise, maximise and close buttons (`titleBarOverlay`),
  so the page has no way to ask main to minimise, maximise or close.
- `tailshare://join/<CODE>` links are matched as written by one regex in
  `src/main/join-link.ts`: lowercase scheme and host, then 8 code characters
  or 4+4 with one dash. Credentials, a port, a query, a fragment, an extra
  segment, a trailing slash, a percent escape, a backslash, another host or
  scheme, and a letter outside the code alphabet are all refused. Only the
  bare code reaches the page, on one exact channel. A link is a bearer secret
  (it joins the room): argv, links and codes are never logged. The single-
  instance lock only stops a second copy; it is not authentication. A link
  that arrives before the page listens is held (10 at most) and sent when the
  page says it is ready.
- Recent rooms are a local file, `recent-rooms.json` in the user data folder,
  holding name, code and last-seen time only: at most 20 rooms, forgotten after
  30 days. The file contains the codes, so it is as private as the user
  folder. No chat, members, paths or transfers are ever saved, and chat
  still lives in memory only.
- The token is 32 random bytes (64 hex characters), new for every sidecar
  start, kept in memory, never logged and never in a URL. It goes to the sidecar
  in the environment and to the page only after the health check passes.
- The sidecar prints one line, `TAILSHARE_READY http://127.0.0.1:<port>`. Main
  reads at most 4 KiB before that line and refuses anything that is not
  `127.0.0.1` with a real port.
- Main keeps the sidecar's stdin open. The sidecar exits when it closes, so a
  crashed or killed Electron cannot leave it running. A normal quit closes
  stdin first and kills only if it has not gone after 3 seconds.
- The page's CSP is set in `web/apps/desktop/src/renderer/index.html`:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*;
  object-src 'none'; base-uri 'none'; form-action 'none'`. Scripts only run
  from our own files. `connect-src` reaches `http://127.0.0.1:*` and
  `ws://127.0.0.1:*`: the port is dynamic and a `file://` page gets no
  per-launch header. Loopback only, plus the bearer token on every call.
  `'unsafe-inline'` is for styles only: the screen sets inline `style`
  attributes (the transfer dock height, and the resizable and sheet parts set
  their own sizes), and a style attribute cannot be allowed any other way.
- A packaged page loads from `file://`, and Chromium sends `Origin: file://`
  on a WebSocket. `fixSocketOrigin` in `src/main/window.ts` rewrites that one
  value to `null` for socket requests, so the sidecar's exact `null` check
  still holds. Nothing else about the request changes.
  ponytail: the upgrade is an `app://` protocol with an exact-port CSP header
  (it changes the page Origin from `null`, so the sidecar allowlist changes too).
- The dev renderer is pinned to port 5173 (`strictPort`) because the sidecar
  only accepts that dev Origin.

## Transfers

Transfer sources and upload destinations use the room root. Locally requested
downloads use a separate confined downloads root; they never become room files.
The destination must be a base name without separators or a `..` component, and collisions
become `name (2).ext`. Each queued download pins its root and relative name,
including across pause/resume and settings changes. Downloads roots are deduplicated
by directory identity; old roots close once no active or resumable job pins them
when settings change or the session ends. Stored `ask` mode currently
uses the configured save folder. Peer upload destinations
and download sources pass through `share.Localize` and `os.Root`. Files only
are supported, with two active transfers across both directions and a 1 TiB
size limit. The declared size caps reads and writes on the data stream.

Unfinished files use `.tailshare-part` beside the destination. These names
are refused in peer paths and hidden from listings. Partial files must be
regular files; links and folders are refused. Pause and connection loss keep
the partial; cancel removes it. An explicit sender-side upload failure cancels
and removes the receiver partial. Before acceptance, available disk space must
cover remaining receive bytes plus a 64 MiB reserve, including active receives.
Rooms cap private partial entries at 200 and partial bytes and reserved sizes plus the proposed
file at 1 TiB. Opening a room prunes private files older than seven days.
Private metadata binds each partial to sender mesh identity, hash and size;
another identity cannot resume, truncate or delete it through an offer.
Nonempty unowned legacy partials are refused. Fresh sessions use fresh mesh
identities, so they cannot resume an earlier identity's partial. The chosen folder and local programs modifying it remain
trusted, as described above.

The receiver re-reads the entire partial and verifies SHA-256 before publishing.
A mismatch deletes the partial. Publication uses `os.Root.Link` followed by
`Remove`, so an existing final name can never be replaced, including one that
appears during transfer. Volumes without hard-link support fail with a plain
sentence only when exclusive reservation and rename also fail. The fallback
first reserves the final name with `O_EXCL`, then renames the partial over that
reservation. Other local programs remain trusted during that operation.
Any publication error keeps the verified partial. A crash between link and removal may
leave both names for the same verified file.

Hashing checks cancellation at least every MiB. A download's offer deadline
allows a full source read at one second per MiB plus thirty seconds. Only the
manager's attached member may call transfer methods; offers are limited to four
per second. Refused offers are discarded and terminal history retains at most
200 jobs. The peer's authenticated conversation supplies this authorization.

Download resume trusts the owned prefix size until the final whole-file checksum;
a stale prefix is removed on mismatch and the user retries from zero. A
prefix hash in `transfer.resume` is the future upgrade. Progress stays local;
only completion, failure and cancel verdicts travel on the control stream.
Transfer IDs must have the 26-character `rand.Text` base32 shape on every
peer-sent control and data message. A responder refuses every known ID,
including retained finished attempts, and duplicate pending stream registrations are
refused. Unknown or late data streams close without writing a file. Stream
headers have a ten-second read deadline; stream and verdict waits are bounded
at thirty seconds.

## Chat

Chat travels over the same encrypted tunnel as everything else, and it is
kept as little as possible.

- It lives in memory only. It is never written to disk and never logged.
- Only the last 200 lines are kept. Older ones are dropped.
- It is gone when the session ends.
- Text is at most 8 KiB of valid UTF-8, and the ID has no control characters,
  so the other computer cannot send anything the screen cannot show.

## Local API

The Electron app talks to the Go sidecar over HTTP and a WebSocket on this
machine (`internal/api`). Other programs and web pages must not be able to
drive it.

- **Loopback only.** `Listen` accepts only an IPv4 loopback address
  (`127.0.0.1:port`); `0.0.0.0`, `::`, hostnames and other addresses are
  refused at startup, before anything is printed.
- **Token on every request.** Electron makes 32 random bytes as hex and
  passes them in `TAILSHARE_TOKEN`. Every route, including health and unknown
  paths, needs one `Authorization: Bearer <token>` header, compared in
  constant time. The WebSocket (`/api/live`) takes the token as a second
  subprotocol (`["tailshare.v1", token]`), checked before the upgrade. Query
  strings are never read for the token, because URLs end up in logs. The
  server agrees on `tailshare.v1` only, so the token is not echoed back.
- **Host check.** Only `127.0.0.1:<port>` and `localhost:<port>` for the
  bound port are accepted, so DNS rebinding cannot reach the API. Forwarded
  headers are never trusted.
- **Origin check.** If a request carries an `Origin`, it must be exactly
  `null` (the packaged app) or `http://localhost:5173` (the Vite dev server).
  Anything else is refused. The allowed origin is echoed back, never `*`, and
  credentials are never allowed. A CORS preflight (`OPTIONS`) from an allowed
  origin is answered without the token, because browsers do not send it
  there; it grants nothing, and the real request still needs the token.
- **Safe errors.** Callers only see `{code, message}` with a plain sentence.
  Raw Go errors, local paths and text from the other computer are never sent
  on. Unknown errors become a generic 500.
- **Room access.** Host and join open a room root under `TAILSHARE_ROOMS_DIR`.
  Every peer path goes through `share.Localize` and `os.Root`; the removed
  `/api/folder` route cannot replace that root.
- **Main-only paths.** `POST /api/room/files` and `PUT /api/downloads` also need
  one `X-Tailshare-Main` header, compared in constant time against
  `TAILSHARE_MAIN_TOKEN`. Main generates a fresh second token for each sidecar
  launch, including dev launches, and never sends it to the renderer. When set,
  the sidecar requires 64 hex characters and different decoded bytes from the
  renderer token.
- **Add-files consent.** Main obtains paths from its native multi-file dialog or
  preload resolves real dropped Files with `webUtils.getPathForFile`. Empty
  paths are dropped. At most 100 files are copied through the room root; folders,
  links, junctions and unreadable sources are skipped. Publication is atomic and
  never replaces a file. Replies contain base names and safe sentences only.
  Open folder accepts a validated code; main constructs the canonical path itself.
- **Downloads configuration.** Main sends the save folder after health succeeds
  and whenever it changes. The main-only endpoint creates missing directories
  and opens a separate root; absolute destinations never enter peer or live DTOs.
- **Members list.** `session.state` carries each member's id, display name and
  host/you flags and a short mesh-key fingerprint. Duplicate display names
  receive a fingerprint suffix during admission. Addresses and private keys
  stay in the sidecar. `DELETE /api/session/members/:id` lets only the lowest
  surviving join-order member remove another member and close its links.
  A member refusing `share.admit` is removed so admission can continue.

The current local API still selects one control peer for browsing, chat and
transfers. After that peer is removed while the mesh session survives, its
manager closes and the API attaches a fresh manager to a surviving or newly
joined member. Per-member API ownership is a later change.
