# Start here

## Install and update on Windows

Download the installer from [Tailshare releases](https://github.com/connor-davis/tailshare/releases).
It installs for the current user without elevation. Builds are unsigned: if
SmartScreen warns, verify the source and app before choosing **More info** and
**Run anyway**. Organization policy may prevent this override.

The connect screen's **Updates** card defaults to **Stable**. Packaged builds
check on start and every four hours and download in the background. Click
**Restart to update** after transfers finish. Offline checks can fail without
interrupting sharing; development builds do not check.

Choose **Nightly** to follow development builds only. Returning to **Stable**
waits for a newer stable release; Tailshare never downgrades. The channel is
saved locally in Electron's user-data folder. Chat is never saved there.

Development branches are `connor_davis/<name>` into `develop`, then `develop`
into `main`. The owner merges. A push to main publishes a missing stable
version; a push to develop publishes a nightly with patch+1 and a UTC timestamp.

## Linux, macOS and servers

- **Linux:** download the `Tailshare-<version>-linux-...AppImage` from the
  releases page, `chmod +x` it and run it. It updates itself like Windows.
- **macOS:** download the `-mac-arm64.dmg` (Apple Silicon) or `-mac-x64.dmg`
  (Intel). The app is not signed, so the first time use right-click, **Open**,
  or run `xattr -dr com.apple.quarantine /Applications/Tailshare.app`. It does
  not update itself; the **Updates** card links to the releases page.
- **No screen:** run just the sidecar and host or join by code with the local
  API: [headless.md](headless.md).

## What happens when two people share

1. Alice clicks **Host**. Her sidecar makes a code (`7K3Q-9PXM`), derives
   Tailcat keys from it and starts listening on the home relay region.
2. Bob types the code. His sidecar derives the same keys, rebuilds Alice's
   Tailcat address and connects. Tailcat bootstraps through the relay, then
   switches to a direct link when it can.
3. Alice sees Bob's name and chooses **Allow** or **Deny**. Allow connects
   independently keyed links to every member; the code stays open while sharing.
4. They browse, upload, download and chat over those links.

Why it is safe enough, and what it costs: [security.md](security.md).

## Where things live

| Folder | What it holds |
| --- | --- |
| `cmd/tailshare` | The sidecar binary. |
| `internal/api` | The local API and live WebSocket the screen talks to. |
| `internal/services/codes` | Share code to Tailcat keys and address. |
| `internal/services/session` | Host or join by code, local admission and member links. |
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
| `task icons` | Export and verify app and tray icons from the Tailshare SVG. |
