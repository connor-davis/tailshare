# Tailshare 0.1.0 Windows package proof

## Two-PC proof

Closed on 2026-11-20: owner confirmed the two-PC test works.
No further two-PC proof steps are required.

## Build identity

- Desktop and packaged sidecar version: `0.1.0`.
- App identity: `connor.davis.Tailshare`.
- Target: Windows x64, unsigned assisted per-user NSIS, no elevation.
- Electron `45.4.1`; electron-builder `26.18.1`; electron-updater `6.8.12`.
- Installer: `dist/Tailshare Setup 0.1.0.exe`, with its blockmap and `latest.yml`.
- Icon: Tailshare Swap mark with 16/24/32/48/64/128/256 pixel ICO entries.

## Release validation

Implementation validation is recorded after running the release build and smoke.
Real GitHub release discovery, background download and installation require
a published newer build; local unit tests do not prove the production feed.
