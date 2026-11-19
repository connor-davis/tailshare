# Tailshare

Send files between two computers with a 6-character code. No accounts, no
setup. Traffic is end-to-end encrypted with WireGuard through
[Tailcat](https://github.com/tailscale/tailcat), and goes direct whenever the
networks allow.

Status: the app works end to end: host or join by code, browse, transfer
with resume, and chat. The installer and docs are the last steps
([plan](project/plans/tailshare-v1.md)).

## Develop

Needs Go 1.27, Node.js 22.13+ and [Task](https://taskfile.dev).

```sh
task check      # Go checks and tests, desktop types, lint, formatting and tests
task test       # Go tests (offline)
task test:net   # also run the live relay test (needs internet)
task build      # build bin/tailshare
task web:install # install desktop dependencies
task dev        # launch the desktop shell
task lint:web   # types, lint and formatting
task test:web   # desktop tests
task build:web  # build desktop bundles
task dist       # build the Windows installer into dist/
```

## Installer

`task dist` builds an unsigned Windows x64 installer. It installs for the
current user and needs no admin rights. Steps, the SmartScreen warning and
firewall notes are in [web/apps/desktop/README.md](web/apps/desktop/README.md).

Start with [docs/start-here.md](docs/start-here.md). The wire format is in
[docs/protocol.md](docs/protocol.md). Agents read [AGENTS.md](AGENTS.md).
