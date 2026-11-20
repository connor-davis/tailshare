# Peer protocol

How two Tailshare sidecars talk once the tunnel is up. Both sides run the same
code (`internal/services/peer`), so every rule below holds in both directions.
Why the tunnel is safe: [security.md](security.md).

## Before the session: join line and admission

The code server stays on its code-derived keys with no transport allowlist.
Its streams begin with `join <node public key> <mesh Tailcat address>\n`,
at most 4 KiB, read without consuming any following hello frame. The host
matches the claimed key against the authenticated stream source and parses the
mesh address. The 30-second join-line deadline is cleared before hello.

Both sides then say hello. `share.roster` waits for local Allow or Deny.
The prompt expires after 60 seconds with `join_denied`; the whole join call
has 90 seconds. Allow starts a separate 30-second preparation window and stops
the unused-code expiry. `share.links` prepares all members before the joiner
dials independently keyed mesh links. The admission stream then closes.

Every **mesh** Tailcat stream starts with one byte: `C` for control, `D` for
data. The code-server stream uses the join line above instead. Mesh authenticates
the source key before reading exactly one prefix byte, with a 5-second read
deadline that is cleared afterwards. Bad prefixes and unknown sources close.
`C` is followed by control frames; `D` by the existing 26-byte transfer ID and
file data. Each member has a separate incoming data queue capped at 8 streams;
an excess stream closes. Only the link dialer opens data streams.

## Two kinds of stream

- **One control stream** lives for the whole session. It carries hello,
  folder lists, chat and the transfer messages.
- **One data stream per transfer.** It carries only file bytes. See
  [Data streams](#data-streams).

## Control stream

### Frames

A frame is a 4-byte big-endian length, then that many bytes of JSON.

- A length of 0, or over 1 MiB (`1 << 20`), is an error.
- The length is checked before any memory is set aside, so a peer cannot make
  us allocate more than 1 MiB.
- The header and the body go out in one `Write`, so half a frame is never sent.

Owner: `internal/services/peer/frame.go`.

### Envelope

Every frame has the same shape:

| Field | Meaning |
| --- | --- |
| `version` | Envelope version. Always `1`. |
| `kind` | `request`, `response` or `event`. |
| `id` | Pairs a response with its request. At most 64 characters. Needed for request and response. |
| `method` | What is being asked (see below). |
| `params` | The request or event payload. |
| `result` | The response payload. |
| `error` | A code and a plain sentence, instead of `result`. |

Owner: `internal/services/peer/message.go`.

### Hello and version

Both sides call `peer.Start` and each sends a `hello` request, then waits for
the other's reply.

- The request carries `versions` (the list this build speaks, now `[2]`),
  `displayName`, `sharedFolderName` and an optional `roomName`.
- The reply carries `version` (the one chosen), `displayName`,
  `sharedFolderName` and an optional `roomName`.
- A display name and a room name are at most 64 characters. A folder name is
  at most 255.
- `roomName` is the name the host gave the room. Only the host sends one;
  every member shows it. Older builds leave it out, so the version stays 2.
- If the two lists share no version, the reply is `unsupported_version`.
  Version 1 peers are refused; the envelope itself remains version 1.

Until hello is done, any other request gets `not_ready`.

### Methods

| Method | Kind | What it does |
| --- | --- | --- |
| `hello` | request | Opens the conversation. |
| `list` | request | One page of a folder (`dir`, `offset`, `limit`). |
| `stat` | request | One file or folder (`path`). |
| `chat` | request | One chat message. |
| `transfer.offer` | request | Offers a file in one direction. |
| `transfer.cancel` | request | Stops a transfer. |
| `transfer.resume` | request | Asks to continue from an offset. |
| `transfer.complete` | event | The file arrived and was verified. |
| `transfer.failed` | event | The transfer stopped early. |
| `share.roster` | request | Returns the locally approved joiner's roster. |
| `share.links` | request | Prepares one fresh dialing key per existing member. |
| `share.admit` | request | The admitter authorizes one expected incoming link. |
| `share.leave` | event | The authenticated member leaves. |

`transfer.accept` is not a method. It is the payload of the reply to
`transfer.offer`.

### Error codes

`bad_request`, `unknown_method`, `not_ready`, `not_sharing`,
`unsupported_version`, `too_large`, `bad_path`, `not_found`, `exists`,
`denied`, `internal`, `not_admitter`, `share_full`, `busy`, `join_failed`, `join_denied`.

The share errors mean, respectively: only the earliest surviving member may
admit; eight people are already sharing; another admission is in progress;
not every member could prepare the joiner's links; or the local prompt was denied or expired.

A handler picks the code and sentence by returning a `*RemoteError`. Any other
error becomes a generic sentence, so no Go error text or local path leaves the
computer.

### Events

After hello, `transfer.*` events are published as `EventTransfer` and valid
`share.leave` events as `EventShare`. Unknown events are ignored. Leave must
carry an empty JSON object; claimed IDs and oversized payloads are ignored.
The subscriber supplies the sender's authenticated link identity to mesh.

### Limits

At most 32 requests are in flight and 64 are pending. A peer that holds more
open is treated as broken, and the connection closes.

## Group share methods (version 2)

Allow and Deny are local actions, never peer methods. The admission peer
installs gated roster and links handlers before hello; neither releases share
details before local approval. Ordinary mesh peers get only `share.admit`.

| Method | Params | Result |
| --- | --- | --- |
| `share.roster` | Omitted or `{}` | `{members:[{id,displayName,address,joinOrder}]}`, including the approved joiner. |
| `share.links` | `{links:[{id,linkKey}]}` | `{}` after every existing member has prepared its expected key. |
| `share.admit` | `{joinerId,joinerName,joinerAddress,joinOrder,linkKey}` | `{}` after recording the member and allowing the key. |
| `share.leave` | `{}` | Event; no reply. Its sender is the authenticated member on the link. |

- At most eight people in total. Every ID is the canonical nonzero public node
  key of that member's mesh server. Its Tailcat address must parse and contain
  the same server key. Names are display-only, valid UTF-8, at most 64
  characters, with no control characters. Orders are positive and unique.
- Share payloads, including roster results, are at most 16 KiB. Each address
  is at most 4 KiB. Unknown request fields, missing required values, duplicate
  IDs/orders, and reused keys get `bad_request`. A received roster must
  include the receiver exactly once, with its own address and name intact.
- `share.links` names exactly the existing roster, with a different fresh
  node key for each target. A server identity cannot double as a dialing
  key. Offered keys are not reused, even after an admission fails or a
  member leaves. Each outgoing link owns one Tailcat client and key.
- Only the member with the lowest surviving join order may send `share.admit`.
  Its identity comes from the authenticated link, never from JSON. A joiner
  cannot install itself twice or choose an order older than a known member.
- The admitter waits for every `share.admit` reply before answering
  `share.links`. A failed member preparation returns `join_failed`. A prepared
  member that never opens a link is forgotten after 30 seconds. One locally
  approved admission may prepare at a time (`busy` for a second); its slot
  expires after 30 seconds. The session layer owns the separate Allow prompt.
- Each dial has a 15-second upper bound, or the caller's earlier deadline.
  Tailcat silently ignores unlisted keys; there is no refusal response to
  wait for. The allowlist must be updated before dialing.
- A mesh server seeds its transport allowlist with its own server key (never
  a dialing key). Tailcat treats an empty list as unrestricted; this sentinel
  keeps new servers restricted before the first admission.
- Every accepted stream is checked against both Tailcat's authenticated
  source key and the current expected-member list. Leaving removes expected
  keys and closes only that member's streams/client. Servers keep their keys;
  Tailcat's allowlist cannot shrink, so old keys are refused at the app layer.

Owners: `internal/services/peer/share.go` (wire types),
`internal/services/mesh` (roster, admission, authenticated links).

## Chat

- `chat` carries an `id` and `text` (and the sender's `sentAt`).
- Optional `attachment` is `{ "name": "file.pdf", "path": "docs/file.pdf", "size": 123 }`.
  `path` is relative to the sender's room and passes `share.Localize`; `name`
  is its base name and `size` is nonnegative. The sender stats its own room file
  to fill metadata. Invalid remote attachments reject the whole message with
  `bad_request` and are never recorded. Empty text is allowed only with an attachment.
  JSON decoding ignores unknown fields, so this adds no protocol version. Older
  receivers ignore attachments (and may refuse attachment-only messages).
  Local chat JSON and live events carry the same optional attachment.
  `sharedFolderName` remains in hello for compatibility; the renderer hides it.
- Text is at most 8 KiB of valid UTF-8. The ID is at most 64 characters with
  no control characters.
- The receiver stamps its own clock and its own `seq`, so a wrong clock on the
  other side cannot reorder the log.
- History is kept in memory only, the last 200 lines. It is never written to
  disk and never logged.

Owner: `internal/services/peer/chat.go`.

## Data streams

A transfer's file bytes do not use the control stream.

1. The joiner always opens the data stream (`session.Open`). The host accepts
   it. Whichever side sends the file, the dialing side is the same.
2. The first 26 bytes are the transfer ID, written with a 10 second write
   deadline. IDs are 26 characters (`rand.Text()`; only `A-Z` and `2-7` pass
   `validID`).
3. The host reads those 26 bytes with a 10 second deadline. It closes the
   stream if the ID is unknown, already taken by another stream, or the
   transfer is not active.
4. Every byte after the header is file data. The sender seeks to the agreed
   offset and sends `size - offset` bytes. The receiver appends them to its
   partial file and checks the whole file's SHA-256 before it publishes it.

The offer and accept messages (on the control stream) fix the size, hash and
offset before any byte moves. Resuming is the same: `transfer.resume` names the
offset, which must be between 0 and the file size and match the agreed hash.

Owners: `internal/services/transfer/stream.go` (header),
`run.go` (negotiation), `send.go` and `receive.go` (bytes).

## Direction in an offer

`direction` in `transfer.offer` is the offering side's view. `upload` means the
offerer sends the file. The receiver of the offer flips it with its own
`initiator` flag to learn whether it sends or receives (`newJobLocked` in
`internal/services/transfer/manager.go`). `path` in the offer is a slash path
on the computer that receives it.
