# Start here

## What happens when two people share

1. Alice clicks **Host**. Her sidecar makes a code (`7K3-Q9P`), derives
   Tailcat keys from it and starts listening on the home relay region.
2. Bob types the code. His sidecar derives the same keys, rebuilds Alice's
   Tailcat address and connects. Tailcat bootstraps through the relay, then
   switches to a direct link when it can.
3. Both sides swap to fresh random keys inside the tunnel. The code is now
   dead.
4. They browse, upload, download and chat over that tunnel.

Why it is safe enough, and what it costs: [security.md](security.md).

## Where things live

| Folder | What it holds |
| --- | --- |
| `cmd/tailshare` | The sidecar binary. |
| `internal/api` | The local API and live WebSocket the screen talks to. |
| `internal/services/codes` | Share code to Tailcat keys and address. |
| `internal/services/session` | Host or join by code, admit one joiner, rekey. |
| `internal/services/peer` | The conversation over the tunnel: hello, lists, chat. |
| `internal/services/share` | The shared folder, and the path checks that guard it. |
| `internal/services/transfer` | The transfer queue, resume and checksums. |
| `internal/platform/config` | Every setting, read from env. |
| `web/apps/desktop` | The Electron shell and React screen. |
| `tests` | Repo-wide style checks. |
| `docs/protocol.md` | The wire format between two sidecars: [protocol.md](protocol.md). |
| `project` | Scope briefs and plans. |

Which file owns which job: [code-map.md](code-map.md). How to write code
here: [style-guide.md](style-guide.md).

## Commands

Everything runs through [Task](https://taskfile.dev). Run `task` to list them.

| Command | What it does |
| --- | --- |
| `task check` | Everything CI checks. Run it before every PR. |
| `task build` | Build the sidecar into `bin/`. |
| `task test` | Go tests (offline). |
| `task test:net` | Go tests plus the live relay test (needs internet). |
| `task vet` | `go vet` and staticcheck. |
| `task fmt` | Format Go code. |
| `task fmt:check` | Fail if a Go file is not formatted. |
| `task web:install` | Install the desktop dependencies. |
| `task dev` | Run the desktop app (builds the sidecar first). |
| `task lint:web` | TypeScript, ESLint and Prettier checks. |
| `task test:web` | Desktop main-process tests (offline). |
| `task build:web` | Build the desktop bundles. |
| `task dist` | Build the Windows x64 installer into `dist/` (see `web/apps/desktop/README.md`). |
