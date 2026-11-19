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
| Offline local-DERP session, admission, expiry and rekey tests | `internal/services/session/session_test.go` |

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
