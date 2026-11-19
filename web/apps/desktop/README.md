# Tailshare desktop

From the repository root on Windows, install dependencies with
`task web:install`, then run `task dist`. This builds the Windows x64 Go
sidecar, desktop bundles and NSIS installer in the root `dist/` folder.
The sidecar version comes from this package's `package.json`; ordinary
`task build` builds a development sidecar with version `dev`.

The assisted installer installs for the current user, lets you choose a
folder, and creates desktop and Start menu shortcuts. It needs no elevation
and adds no firewall rules. Uninstalling preserves app data.

## Unsigned builds

These builds are unsigned, so Windows SmartScreen may warn about an
unrecognized app. Only if the installer came from the expected Tailshare
source and the displayed app is the one you expect, choose **More info** →
**Run anyway**. Your organization's policy may prevent this override.

## Firewall

Windows may prompt when the sidecar opens its UDP socket. Allowing it on
private networks gives faster direct links; denying it still works through
the relay. The installer does not change firewall settings.

## Placeholder icon

`build/icon.ico` is a temporary Polyphron mark converted from
`polyphron/web/content/images/favicon.ico`, with 16, 32, 48 and 256 pixel
sizes. Replace it with a Tailshare mark before release.
