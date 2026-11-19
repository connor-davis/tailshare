# Tailshare

Send files between two computers with a 6-character code. No accounts, no
setup. Traffic is end-to-end encrypted with WireGuard through
[Tailcat](https://github.com/tailscale/tailcat), and goes direct whenever the
networks allow.

Status: early. The share-code engine works; the app is being built step by
step ([plan](project/plans/tailshare-v1.md)).

## Develop

Needs Go 1.27, Node.js 22.13+ and [Task](https://taskfile.dev).

```sh
task check      # Go checks plus desktop types, lint and formatting
task test:net   # also run the live relay test (needs internet)
task build      # build bin/tailshare
task web:install # install desktop dependencies
task dev        # launch the desktop shell
task lint:web   # types, lint and formatting
task build:web  # build desktop bundles
```

Start with [docs/start-here.md](docs/start-here.md). Agents read
[AGENTS.md](AGENTS.md).
