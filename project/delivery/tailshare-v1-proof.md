# Tailshare v1 Windows package proof

## Build identity

- Date: 2026-11-20.
- Desktop and packaged sidecar version: `1.0.0` (desktop `package.json`).
- Git commit: `313221f59ac800ecf8cf834580c9d8c0077c6af6` on
  `cd/feat-skeleton`, clean tree. The installer below was rebuilt from it.
  The first smoke ran on an uncommitted `0.0.0` build of the same packaging.
- Windows: Microsoft Windows 11 Pro, version `10.0.26300`, build `26300`,
  64-bit.
- Target: Windows x64; Electron `45.4.1`; electron-builder `26.18.1`.
- Installer: `dist/Tailshare Setup 1.0.0.exe` (unsigned, assisted per-user NSIS).
- Installer size: `148,846,102` bytes.
- Installer SHA-256 (`certutil -hashfile "dist/Tailshare Setup 1.0.0.exe" SHA256`):
  `eb9bae2953a893a0b2088af1b431b6078ed046b9a1f42793d610c7ce967b3934`.
- Packaged sidecar `version` command returns `1.0.0`.
- Icon: temporary Polyphron mark, with 16/32/48/256 pixel ICO entries.

## Packaged smoke

- `task dist`: passed (exit 0). The build produced the installer above and
  `dist/win-unpacked/Tailshare.exe`.
- `dist/win-unpacked/resources/tailshare.exe` exists (`33,016,832` bytes);
  running its `version` command returned `0.0.0`.
- Launched the unpacked app with an isolated user-data directory under
  `mystuff/step13-smoke-profile`; no installation was performed.
- Electron PID `18976` exposed a responding native window titled
  `Tailshare` with a nonzero window handle (`3934048`). This confirms window
  creation; the smoke did not visually inspect the rendered screen.
- `tasklist` confirmed `Tailshare.exe` PID `18976` and `tailshare.exe` PID
  `16676`. `Win32_Process` confirmed sidecar PID `16676` had parent PID
  `18976` and executable path
  `D:\Programming\Polyphron\tailshare\dist\win-unpacked\resources\tailshare.exe`.
- `CloseMainWindow()` returned true; the app exited within 15 seconds and
  its sidecar was no longer running after shutdown.
- Local logs: `mystuff/step13-dist.log` and `mystuff/step13-smoke.json`
  (gitignored). No host/join session was created; firewall prompting and
  direct/relay behavior remain for the two-PC proof.

## Checks

- `GOFLAGS=-p=1 task check`: passed (exit 0) after packaged smoke.
- Go formatting, vet, staticcheck and all offline Go tests passed.
- TypeScript, ESLint and Prettier passed.
- Vitest: 13 test files passed; 116 tests passed.
- Local full check output: `mystuff/step13-check.log` (gitignored).
- Build observations: missing author/description metadata and duplicate
  dependency references were nonfatal. Signing was skipped as expected.
  `npm install` reported six moderate advisories; dependency remediation
  was not included in this packaging change.

## Two-PC 1 GiB proof results

### PC A to PC B

### PC B to PC A

## Two-PC proof runbook

1. After committing the release changes, run `task dist` on Windows. Record
   the version, Git commit, Windows edition/build, and installer SHA-256:
   `certutil -hashfile "dist\Tailshare Setup <version>.exe" SHA256`.
2. Install on both PCs for the current user. Follow the desktop README's
   SmartScreen guidance only after confirming the expected source. Record
   both PCs' Windows versions and network context; choose separate existing
   share folders with enough free space.
3. On PC A choose Host. On PC B choose Join and enter A's displayed
   six-character code. Wait for connected state.
4. Create a deterministic file of at least `1,073,741,824` bytes (1 GiB) on
   A. Record its creation method, name, exact size and source SHA-256 using
   `certutil -hashfile "<source-path>" SHA256`. Upload A to B through the UI
   and wait for completion. Hash B's received file with `certutil` and
   compare the exact 64-hex values.
5. Create a distinct deterministic 1 GiB file on B and record the same
   details. Download B to A through the UI. Hash B's source and A's received
   file with `certutil` and compare the exact 64-hex values.
6. Fill the empty results sections with source/destination paths, exact file
   sizes, source and received hashes, elapsed times, app/sidecar versions,
   machine/Windows versions and network context. Save screenshots of the
   code/connected state and completed transfers under
   `project/delivery/tailshare-v1-proof/`, omitting credentials and unrelated
   files, and link them here. Both distinct 1 GiB directions must match.
