# Start here

## What happens when two people share

1. Alice clicks **Host**. Her sidecar makes a code (`7K3-Q9P`), derives
   Tailcat keys from it and starts listening on the home relay region.
2. Bob types the code. His sidecar derives the same keys, rebuilds Alice's
   Tailcat address and connects. Tailcat bootstraps through the relay, then
   switches to a direct link when it can.
3. Both sides swap to fresh random keys inside the tunnel. The code is now
   dead.
4. They browse, upload, download and chat over that tunnel.

Why it is safe enough, and what it costs: [security.md](security.md).

## Where things live

| Folder | What it holds |
| --- | --- |
| `cmd/tailshare` | The sidecar binary. |
| `internal/services/codes` | Share code to Tailcat keys and address. |
| `internal/platform/config` | Every setting, read from env. |
| `tests` | Repo-wide style checks. |
| `project` | Scope briefs and plans. |

Which file owns which job: [code-map.md](code-map.md). How to write code
here: [style-guide.md](style-guide.md).
