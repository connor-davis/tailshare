# Peer protocol

How two Tailshare sidecars talk once the tunnel is up. Both sides run the same
code (`internal/services/peer`), so every rule below holds in both directions.
Why the tunnel is safe: [security.md](security.md).

## Before the session: rekey

The code's own server only admits the joiner and hands it a fresh address.
This runs before any frame below, so it uses plain text lines
(`internal/services/session/rekey.go`), with a 30-second limit:

1. Joiner → host: `join <node public key>\n` (max 1 KiB). The host checks the
   key matches the one that opened the stream.
2. Host → joiner: `rekey <new Tailcat address>\n` (max 16 KiB).
3. The joiner dials the new address, then sends one byte, `1`, as the ack.
   Only then does the host retire the code's server.

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

- The request carries `versions` (the list this build speaks, now `[1]`),
  `displayName` and `sharedFolderName`.
- The reply carries `version` (the one chosen), `displayName` and
  `sharedFolderName`.
- A display name is at most 64 characters. A folder name is at most 255.
- If the two lists share no version, the reply is `unsupported_version`.

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

`transfer.accept` is not a method. It is the payload of the reply to
`transfer.offer`.

### Error codes

`bad_request`, `unknown_method`, `not_ready`, `not_sharing`,
`unsupported_version`, `too_large`, `bad_path`, `not_found`, `exists`,
`denied`, `internal`.

A handler picks the code and sentence by returning a `*RemoteError`. Any other
error becomes a generic sentence, so no Go error text or local path leaves the
computer.

### Events

Only `transfer.*` events are passed on to the transfer manager. Other events
are ignored, so a newer build can send ones this build does not know.

### Limits

At most 32 requests are in flight and 64 are pending. A peer that holds more
open is treated as broken, and the connection closes.

## Chat

- `chat` carries an `id` and `text` (and the sender's `sentAt`).
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
