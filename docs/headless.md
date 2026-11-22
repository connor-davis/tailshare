# Use Tailshare without the desktop app

The desktop app is a screen on top of one program, the sidecar. You can run the
sidecar alone on a server or a box with no screen, then host or join by code
with plain HTTP calls. Nothing else is needed.

The two computers can be any mix: a Linux server hosting, a Windows laptop
joining with the desktop app, or two headless boxes.

## 1. Get the sidecar

- A desktop install already carries it. It is `tailshare` (`tailshare.exe` on
  Windows) in the app's `resources` folder.
- From source: `task build` makes `bin/tailshare` (`bin\tailshare.exe`).

## 2. Start it

Pick a token. It is the password for every call. Make it 32 random bytes as 64
hex characters:

```sh
export TAILSHARE_TOKEN=$(openssl rand -hex 32)
export TAILSHARE_ROOMS_DIR=$HOME/tailshare-rooms   # must be an absolute folder
mkdir -p "$TAILSHARE_ROOMS_DIR"
```

Each room gets a folder below `TAILSHARE_ROOMS_DIR`, named after its code. That
folder is what you share.

Then start it **with its standard input kept open**:

```sh
sleep infinity | tailshare serve
```

**Gotcha: if standard input closes, the sidecar shuts itself down.** That is on
purpose, so a sidecar never outlives the app that started it. It means
`tailshare serve &`, `nohup tailshare serve &` and `tailshare serve < /dev/null`
all exit at once. Keep a terminal open, or feed it `sleep infinity |` as above.
Under systemd, use a unit whose `ExecStart` is
`/bin/sh -c 'sleep infinity | /usr/local/bin/tailshare serve'`.

The first line it prints is the address:

```
TAILSHARE_READY http://127.0.0.1:41873
```

Use that address as `$BASE` below. The port is random unless you set
`TAILSHARE_ADDR` (it must be an IPv4 loopback address, such as `127.0.0.1:8787`).

Other settings, all optional: `TAILSHARE_REGION` (301 NYC, 302 SFO, 303 FRA, 304
TOK or `nearest`), `TAILSHARE_IDENTITY` (a stable key for trusted joins),
`TAILSHARE_MAIN_TOKEN` (see step 5). `tailshare env` lists every setting.

Every call carries the token:

```sh
AUTH="Authorization: Bearer $TAILSHARE_TOKEN"
```

## 3. Host

```sh
curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"displayName":"Server box","roomName":"Files"}' $BASE/api/session/host
```

The answer holds the code, like `7K3Q-9PXM`. Send it to the other person. Put the
files to share in `$TAILSHARE_ROOMS_DIR/<code>/`.

When someone joins, their request shows up as `join` in
`curl -s -H "$AUTH" $BASE/api/session`. Check the name and fingerprint with them,
then answer using its `id`:

```sh
curl -s -X POST -H "$AUTH" $BASE/api/session/joins/<id>/allow
# or .../deny
```

Nobody gets in without that call.

## 4. Join

On the other computer, run its own sidecar with its own `TAILSHARE_ROOMS_DIR`
(step 2), then:

```sh
curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"code":"7K3Q-9PXM","displayName":"Laptop"}' $BASE/api/session/join
```

It waits until the host allows you. One sidecar holds one session; a second
host or join answers 409 until you leave with
`curl -X DELETE -H "$AUTH" $BASE/api/session`.

## 5. Browse and move files

```sh
curl -s -H "$AUTH" "$BASE/api/files/peer?path="            # their folder
curl -s -H "$AUTH" "$BASE/api/files/local?path="           # yours
curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"direction":"upload","source":"report.pdf","destination":"report.pdf"}' \
  $BASE/api/transfers
curl -s -H "$AUTH" $BASE/api/transfers                      # progress
curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"text":"hello"}' $BASE/api/chat
```

`upload` sends a file from your room folder to theirs. `download` fetches one of
theirs, and saves it into your downloads folder. Choosing that folder is a
"main-only" call: start the sidecar with `TAILSHARE_MAIN_TOKEN` set to a
different 64-hex value, then send both headers:

```sh
curl -s -X PUT -H "$AUTH" -H "X-Tailshare-Main: $TAILSHARE_MAIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"folder":"/srv/tailshare-downloads"}' $BASE/api/downloads
```

Live updates (transfer progress, chat, who joined) come over the WebSocket at
`/api/live`, so a script can wait on it instead of polling.

## Good to know

- The API only answers on `127.0.0.1` and only with the token. To reach it from
  elsewhere, use an SSH tunnel; do not expose it.
- Chat is kept in memory only. Stopping the sidecar forgets it.
- Every path a peer sends is checked against the room folder, headless or not
  ([security.md](security.md)).
- There is no `host` or `join` command yet. The API above is the supported way.
