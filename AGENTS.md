# Tailshare

Tailshare is a desktop app for sending files between two computers. One side
shows a 6-character code like `7K3-Q9P`, the other types it in, and both get
an FTP-style two-pane view of each other's shared folder, a transfer queue and
a chat. It replaces `connor-davis/peershare`.

It is an Electron app (React, TanStack, Effect, shadcn) with a Go sidecar
that does all networking and file work over Tailcat, Tailscale's
no-account WireGuard library.

## What belongs in Tailshare

- Peer-to-peer sharing between two machines: connect by code, browse,
  upload, download, resume, chat. Nothing more in v1 (see
  [the plan](project/plans/tailshare-v1.md)).
- No accounts, no servers of our own. Codes are turned into Tailcat
  addresses on each machine ("seeded keys",
  [docs/security.md](docs/security.md)).
- Patterns come from Viper (`D:\Programming\Polyphron\viper`) and 3REco
  (`D:\Programming\Use-IT\3reco`). Brand colours come from Polyphron
  (`D:\Programming\Polyphron\polyphron`).
- Every path a peer sends is checked against the shared folder, and has a
  test that tries to escape it.
- Live data goes from the sidecar to the UI over a WebSocket, never through
  polling.
- Chat lives in memory only. It is never written to disk.

## Layout

- `cmd/tailshare` - the sidecar binary: `version`, `env`, and later `serve`.
- `internal/services/<area>` - the logic. `codes` turns a share code into
  Tailcat keys and an address; `session` hosts or joins by code, admits one
  joiner and rekeys.
- `internal/platform` - shared pieces: `config` (every setting, from env).
- `tests` - repo-wide checks (file size, doc comments).
- `docs` - [start here](docs/start-here.md), [code map](docs/code-map.md),
  [style guide](docs/style-guide.md), [security](docs/security.md).
- `project` - scope briefs, plans, decisions and delivery records.
  `mystuff` - local notes, maps and design mockups, untracked.
- Coming in later plan steps: `internal/api` (Fiber v3 local API and
  WebSocket), `web/apps/desktop` (Electron main, preload and the React
  renderer).

## Code map

The owner lists (which file owns which job) live in
[docs/code-map.md](docs/code-map.md). Read it before writing a new helper,
and add a line there when you add an owner.

## Commands

All commands run through [Task](https://taskfile.dev); `task` lists them.

- `task build` - build the sidecar into `bin/`.
- `task test` - Go tests. They run offline.
- `task test:net` - the same plus the live Tailcat relay test
  (`TAILSHARE_NET=1`). It needs the internet.
- `task check` - gofmt, vet, staticcheck and Go tests. Run it before every PR.
- Other tasks: `fmt`, `fmt:check`, `vet`.

## Code style

The rules are in [docs/style-guide.md](docs/style-guide.md). In short:

- Blank lines between steps. Comments say why, in plain words.
- Go: a doc comment on every exported name (`tests/style_test.go` checks
  it); a call goes on one line if it fits in 100 characters, otherwise one
  argument per line.
- TypeScript: a TSDoc comment on every export.
- No file over 900 lines. Split a long file by job; never squeeze lines to
  fit.
- UI: modern FTP layout, Polyphron brand colours, and every screen works in
  light and dark.

## Work rules

- Branches are `<initials>/<type>-<slug>` off `main` (for example
  `cd/feat-transfers`). Every change lands through a PR into `main` with a
  pr-evidence body (`/pr-evidence:pr-evidence`). The owner merges; agents
  never merge unless told to.
- No git worktrees on this machine. Containers, if ever needed, run through
  Kiri's `docker`.
- Changing the code alphabet, the Argon2 settings or the salt in
  `internal/services/codes` breaks every older build. Don't, unless the
  plan says so.

## Agent roles (Orchestrator V2)

T3 Code runs Orchestrator V2: `delegate_task` starts a sub-agent on any
provider and model (`orchestrator_capabilities` lists them). Work this way
for every task with more than a small edit.

- **Orchestrator - Opus 5.5.** Reviews what comes back and moves the work
  to its next step. It hands out tasks, checks each map and diff, and writes
  the documents (plans, decisions, PR bodies). It does not write product
  code.
- **Developer - Sonnet 5.5 (`claude-sonnet-5-5`) or GPT 6.1 Sol
  (`gpt-6.1-sol`).** Writes the code and its tests and runs them. It always
  starts from a mapper's map that covers 100% of the task. It never starts a
  mapper or any other sub-agent; if the map is short, it stops and tells the
  Orchestrator what is missing.
- **Repo mapper - Haiku 5.5 (`claude-haiku-5-5`) or GPT 6 Luna
  (`gpt-6-luna`).** Maps everything the task touches, so the Developer needs
  no search of its own: every file and owner involved (from
  docs/code-map.md), the call paths, the tests that cover them and the rules
  that apply. A mapper may start more mappers to split a big map, but only
  Haiku 5.5 or GPT 6 Luna. It writes maps to `mystuff/maps/` only.

Every sub-agent runs at **medium effort or lower**. Set it on each
`delegate_task` call: some models default higher (Sonnet 5.5 defaults to
high).

Balance the work between Claude and GPT models. Take turns, round robin.
When two tasks run side by side, give one to each provider. Skip a provider
only when it is unavailable, and say so.

How they work together:

1. The Orchestrator sends a mapper the task.
2. The Orchestrator checks the map covers the whole task: every file the
   change touches, its owner and its tests. If not, it sends a mapper a
   narrower question.
3. The Orchestrator gives the Developer the task with the full map.
4. The Orchestrator reviews the Developer's diff and test output, then
   commits or sends it back, and moves to the next task.

If a running sub-agent goes the wrong way, steer it with a message
(`t3_thread_send` to its thread). Don't cancel it and start over.

The Orchestrator answers every sub-agent question itself, and its own
questions too. It researches first when unsure, and only asks the user
about a real product choice. Every decision, by anyone, goes into
`mystuff/decisions.md` (local, gitignored) with the date, the why and
who decided.

## Learnings

Add short notes here when something surprises you, under the closest group.

### Tailcat

- `tailcat.Server.Key` and `PresharedKey` accept our own keys, and
  `tailcat.DiscoPublicForNode` gives the disco key, so a full `ConnInfo` can
  be built from a code alone.
- Tailcat's free relays are only regions 301 NYC, 302 SFO, 303 FRA and
  304 TOK (`https://tailcat.dev/derpmap.json`).
- Tailcat v0.7.0 leaves `Status().Peer[k].TailscaleIPs` empty. A peer's
  tunnel IP is `fd7a:115c:a1e0::/48` plus the first 10 bytes of its node
  key (`session.tailcatIP`), so a stream's source names its key.
- Tailcat v0.7.0 has `AddAllowedClient` / `AllowedClients`, not
  `AllowClient`, and no way to drop a connected peer. Moving to a new
  server is the only cut-off.
- Offline tests use a local relay: `tstest/integration.RunDERPAndSTUN`,
  plus the netcheck captive-portal hook in `TestMain`
  (`internal/services/session/session_test.go`).
- `key.NodePrivateFromRaw32` and `NodePublic.Raw32` are deprecated. Read
  raw bytes with `AppendTo`; build a node key with
  `UnmarshalText("privkey:" + hex)`.

### Windows and tooling

- On Windows, Python can't read git-bash `/tmp` paths. Keep scratch files
  inside the repo (for example `mystuff/`) and use relative paths.
- Python on Windows writes CRLF with `open(p, 'w')`. Pass `newline=''` on
  both read and write when a script edits repo files.
- A Windows Go test can fail to start with `0xc0000142`. Retry with
  `GOFLAGS=-p=1` so packages run one at a time.
- Task ignores `dir:` on a single `cmd:` entry, so the command runs from
  the repo root. Write `cd web/apps/desktop && ...` instead.
