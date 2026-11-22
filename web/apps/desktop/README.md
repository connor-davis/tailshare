# Tailshare desktop

Download the Windows x64 or ARM64 installer from
[Tailshare releases](https://github.com/connor-davis/tailshare/releases).
The assisted installer installs for the current user, lets you choose a folder,
and creates desktop and Start menu shortcuts. It needs no elevation and adds no
firewall rules. Uninstalling preserves app data.

## Updates and channels

**Settings → Updates** selects **Stable** (the default) or **Nightly**.
Installed builds check on start and every two minutes. When an update is
available, the top bar shows **Update available** with the release notes, and
Settings shows a **Download** button. Nothing downloads until you choose to.
Once downloaded, the top bar shows a restart icon and Settings shows
**Restart to update**. Finish transfers first.
Restart stops the sidecar before running the installer. Closing the app alone
does not install a downloaded update.

Windows ARM64 uses `latest-arm64.yml` and `nightly-arm64.yml`; x64 keeps its
existing feed names. Stable follows normal GitHub Releases through `latest.yml`. Nightly users
follow nightlies only, through `nightly.yml`, with prereleases enabled. Nightly
versions are the base stable version with patch+1 and `-nightly.<UTC yyyymmddhhmm>`.
Switching from Nightly to Stable waits until a newer stable is available;
`allowDowngrade` stays false. Nightly changes may be unfinished.

The selected channel is stored as `{ "updateChannel": "latest" | "nightly" }`
in `settings.json` under Electron's user-data directory. A missing or corrupt
file defaults to Stable; writes replace the file atomically. Chat remains in
memory. Update failures do not interrupt sharing; the next scheduled check
tries again. Development builds do not check or install updates.

## Portable Windows copies

Choose `Tailshare-Portable-<version>-x64.exe`, or the `-arm64.exe` copy on a
Windows ARM computer. Run it from a writable folder. Settings, identity,
trusted computers, rooms and browser data live in `Tailshare Data` beside the
original executable, so move that folder with the executable. Downloads still
use the save folder in Settings; choose a folder on the drive if they should
travel too. Use an NTFS drive: file publication relies on hard links, which
FAT32 and exFAT do not support.

Portable copies never register Start with Windows, the Explorer menu or
`tailshare:` links. Type or paste a room code to join. They do not update
themselves: **Settings → Updates → Releases page** opens the download page.
Close the copy before replacing its executable. The same SmartScreen warning
as the installer can appear on first launch.

## Build and release

From the repository root on Windows, run `task web:install`, then `task check`
and `task dist`. This builds the Go sidecar, desktop bundles and NSIS installer
in root `dist/`. The default version comes from this package's `package.json`.
Ordinary `task build` uses version `dev`.

`task dist GOARCH=arm64` builds the ARM64 installer. Add `"TARGETS=nsis portable"`
to build both Windows package types for that architecture, or `TARGETS=portable`
for just the portable copy. GOOS defaults to `windows`, GOARCH to `amd64` and
TARGETS to `nsis`. The OS and architecture flags also select the matching Go
sidecar; later platform packaging can use `GOOS=linux TARGETS=AppImage` or
`GOOS=darwin TARGETS=dmg`. Those desktop targets are not shipped yet.

`task dist VERSION=0.1.1-nightly.202611201200 CHANNEL=nightly` overrides both
the Go linker version and electron-builder's `extraMetadata.version` without
changing package metadata. CHANNEL defaults to `latest`. Every `dist` build
uses `--publish never`, so it needs no publishing token and creates no release.

CI runs on PRs and pushes to develop/main. Branch flow permits only
`connor_davis/*` into develop and develop into main. The owner merges. A push
to main publishes `v<desktop version>` only when that release does not exist.
A push to develop builds a timestamped nightly prerelease. Workflows build
locally, then use `gh release create` against that exact commit with the
installers, blockmaps, architecture-specific channel manifests and portable
copies for x64 and ARM64. No manual tag is required.
Release workflows copy the local installer and blockmap to names with hyphens
(`Tailshare-Setup-<version>.exe`, with `-arm64` before `.exe` for ARM64) before
upload, matching builder's GitHub manifest.

App identity is `connor.davis.Tailshare` in builder and Electron's Windows
AppUserModelID. Keep it stable for installed users.

Builder 26.18.1's GitHub provider emits only the configured channel manifest,
even with `generateUpdatesFilesForAllChannels`; that ineffective option is
omitted. `publish.channel` is overridden by the build, with no top-level
`nightly` configuration. See the [builder channel guide](https://www.electron.build/tutorials/release-using-channels/)
and the installed `app-builder-lib/out/publish/updateInfoBuilder.js` implementation.

## Icons

`build/logo.svg` is the Tailshare Swap mark. `task icons` uses the checked-in
`scripts/export-icons.mjs` with pinned sharp and png-to-ico dependencies to
write `icon.ico` (16/24/32/48/64/128/256), `icon.png` (512), `tray-16.png` and
`tray-32.png`. The exporter asserts every dimension. `task dist` runs it too.
Card and Select were generated using `npx shadcn@4.23.0 add card select --yes`.

## Unsigned builds

These builds are unsigned, so Windows SmartScreen may warn about an
unrecognized app. Only if the installer came from the expected Tailshare
source and the displayed app is the one you expect, choose **More info** →
**Run anyway**. Your organization's policy may prevent this override.

## Room links and recent rooms

Clicking a `tailshare://join/<CODE>` link opens or focuses Tailshare and
starts the normal join. The first time, Windows may ask which app opens
`tailshare:` links; Tailshare does not force itself as the default if you
choose another. Recent rooms (name, code and last-seen time) stay on this
computer for at most 30 days, 20 rooms at most. Chat is never saved.

## Firewall

Windows may prompt when the sidecar opens its UDP socket. Allowing it on
private networks gives faster direct links; denying it still works through
the relay. The installer does not change firewall settings.

## Keyboard

Everything can be reached with Tab and Shift+Tab. These keys do more:

| Keys        | Where                          | What it does          |
| ----------- | ------------------------------ | --------------------- |
| Ctrl+K      | Anywhere in the window         | Jumps to Search rooms |
| Escape      | Search rooms                   | Clears the search     |
| Enter       | Chat box                       | Sends the message     |
| Shift+Enter | Chat box                       | Starts a new line     |
| Escape      | While dragging files over chat | Stops the drag        |

Buttons that are not available right now (New room while a room is open, for
example) stay in the Tab order and say why in their tooltip. A finished
download has a Show file button, so the file can be found without dragging.
