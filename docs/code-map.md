# Code map

Which file owns which job. Read this before you write a new helper, and add a
line when you add an owner.

## Share codes

| Job | Owner |
| --- | --- |
| Code alphabet, random codes, parsing user input (look-alikes, dashes) | `internal/services/codes/codes.go` (`New`, `Parse`, `Code.String`) |
| Code to node key + pre-shared key (Argon2id), and code to full Tailcat address | `internal/services/codes/codes.go` (`Derive`, `Addr`) |
| Parse/derive tests and the live relay spike | `internal/services/codes/codes_test.go` |

## Sessions

| Job | Owner |
| --- | --- |
| Tunnel lifetime, stream opening and accepting, session port | `internal/services/session/session.go` (`Session`, `Open`, `Accept`, `Close`) |
| Host code, first-joiner admission and ten-minute expiry | `internal/services/session/host.go` (`Host`) |
| Join by code and resolve the relay address | `internal/services/session/join.go` (`Join`) |
| Fresh host keys, allowlisted reconnect and bootstrap acknowledgment | `internal/services/session/rekey.go` |
| Offline session, admission, expiry and rekey tests (on `tailcattest`) | `internal/services/session/session_test.go` |

## Peer protocol

| Job | Owner |
| --- | --- |
| Start a conversation, hello and version choice, request/response/event API for the local API, extra handlers for step 5 | `internal/services/peer/peer.go` (`Start`, `Peer`, `Call`, `Notify`, `Options`) |
| Frame format: 4-byte length + JSON, 1 MiB cap | `internal/services/peer/frame.go` |
| Envelope, method names, error codes, typed hello/list/chat and transfer payloads | `internal/services/peer/message.go` |
| The one reader, request routing, answers, closing | `internal/services/peer/dispatch.go` |
| List and stat, asking and answering | `internal/services/peer/browse.go` (`List`, `Stat`) |
| Chat: checks, 200-message memory history, events and subscriptions | `internal/services/peer/chat.go` (`SendChat`, `Subscribe`, `Event`) |
| Frame, protocol, chat and over-a-real-session tests | `internal/services/peer/*_test.go` |

## Shared folders

| Job | Owner |
| --- | --- |
| Open the shared folder once (`os.Root`), list, stat, close | `internal/services/share/share.go` (`Open`, `Root`) |
| Peer path rules (slash paths, no `..`, drives, streams, device names) | `internal/services/share/path.go` (`Localize`) |
| Confined read and exclusive-create for downloads and uploads | `internal/services/share/files.go` (`OpenRead`, `Create`) |
| Path table, escape, link and junction tests | `internal/services/share/*_test.go` |

## Test support

| Job | Owner |
| --- | --- |
| Local relay for offline network tests: `Init` (call from `TestMain`), `LocalDERP`, `ServeMap` | `internal/testsupport/tailcattest/tailcattest.go` |

## Settings and binary

| Job | Owner |
| --- | --- |
| Every env setting, its default and help text | `internal/platform/config/config.go` (`EnvVars`, `Load`) |
| Build version string | `internal/platform/config/config.go` (`Version`), set by `task build` |
| CLI commands | `cmd/tailshare/main.go` |

## Repo checks

| Job | Owner |
| --- | --- |
| No file over 900 lines; doc comment on every exported Go name | `tests/style_test.go` |
| Staticcheck settings | `staticcheck.conf` |

## Desktop app

Paths below are relative to `web/apps/desktop` unless stated otherwise.

| Job | Owner |
| --- | --- |
| npm workspace, task graph, shared compiler/format/lint rules | `web/package.json`, `web/turbo.json`, `web/tsconfig.json`, `web/prettier.config.js`, `web/eslint.config.js` |
| Desktop commands and isolated build targets | `package.json`, `electron.vite.config.ts`, `tsconfig*.json` |
| Secure window and Electron lifecycle | `src/main/index.ts` |
| Empty typed desktop bridge and browser declaration | `src/preload/index.ts`, `src/shared/bridge.ts`, `src/renderer/src/types/desktop.d.ts` |
| Renderer entry and Content Security Policy | `src/renderer/index.html` |
| Query client, hash router and system colour preference | `src/renderer/src/main.tsx` |
| Root outlet and placeholder home route | `src/renderer/src/routes/__root.tsx`, `src/renderer/src/routes/index.tsx` |
| Generated route tree (router plugin owns it) | `src/renderer/src/routeTree.gen.ts` |
| shadcn generation, button and class utility | `components.json`, `src/renderer/src/components/ui/button.tsx`, `src/renderer/src/lib/utils.ts` |
| Design rules and light/dark semantic tokens | root `DESIGN.md`, `src/renderer/src/styles/globals.css` |
