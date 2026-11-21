# Competitor bar

Tailshare 0.1.2 measured against the tools people reach for today. Each row is a
core feature of a rival. **Match** means Tailshare does it; **Beat** means it
does it with less setup or more privacy; **Skip** is a deliberate non-goal, with
the reason. Rival facts are from their public feature pages as of November 2026.

Tailshare's baseline across every row: no account, no server of our own, end-to-end
WireGuard (Tailcat) between members, an 8-character code or `tailshare://` link,
rooms of up to 8 people, and local Allow/Deny for every joiner.

## Files: LocalSend, Blip

| Core feature | LocalSend | Blip | Tailshare | Verdict |
|---|---|---|---|---|
| Send files | Yes | Yes | Yes, dropped into a room's chat | Match |
| Send whole folders | Yes | Yes | No, a dropped folder is skipped with a note; zip it first | Skip for 0.1.2: folder send is a follow-up |
| Works across the internet, not just one LAN | No (LAN only) | Yes | Yes, through relays when no direct path | Beat LocalSend, match Blip |
| No account | Yes | No (sign-in) | Yes | Match LocalSend, beat Blip |
| Resume after a drop | No | Yes | Yes, by offset with SHA-256 check | Match Blip |
| Integrity check | TLS only | Not stated | SHA-256 of every file before publishing | Beat |
| Large files | Yes | Yes, no limit | Yes, up to 1 TiB per file, free-space check | Match |
| Send to many at once | One target per send | Yes | Everyone in the room sees the file | Match |
| Chat alongside files | No | No | Yes, memory only, never on disk | Beat |
| Approve who can receive | Accept prompt per transfer | Contacts | Allow/Deny per joiner, key fingerprint shown | Match |
| Mobile apps | Yes | Yes | No | Skip: Windows desktop first (scope brief) |

## Ports and local servers: ngrok, Tailscale

| Core feature | ngrok | Tailscale | Tailshare | Verdict |
|---|---|---|---|---|
| Share a local TCP port | Yes | Yes (Serve, subnet) | Yes, share `localhost:PORT` with a label | Match |
| Other side gets it on their own localhost | No (public URL) | Yes (tailnet IP) | Yes, `127.0.0.1:<port>` on their PC | Match Tailscale |
| Any TCP protocol (web, DB, SSH, games) | TCP tunnels on paid plans | Yes | Yes | Match |
| No account, no install of a daemon | No (account + agent) | No (account + daemon) | Yes, one app, a code | Beat |
| Private by default | Public URL unless gated | Yes | Only room members can open it; listeners bind loopback | Match Tailscale, beat ngrok |
| Only listed ports are reachable | Yes | ACLs needed | Yes, sharer dials only the listed `127.0.0.1` port | Match |
| One-click open in browser | Yes | No | Yes, for web apps | Match |
| Public internet URL | Yes | Funnel | No | Skip: no public exposure (scope brief) |
| UDP | No | Yes | No | Skip: TCP only (scope brief) |
| Request inspector | Yes | No | No | Skip: dev tool, not core sharing |

## Screen: Parsec, AnyDesk (Tailshare screen sharing is experimental in 0.1.2)

| Core feature | Parsec | AnyDesk | Tailshare | Verdict |
|---|---|---|---|---|
| Share a whole screen | Yes | Yes | Yes | Match |
| Share one window | No | No | Yes | Beat |
| Several viewers at once | Yes | Yes | Yes, everyone in the room | Match |
| No account | No | Optional | Yes | Beat |
| Clear "you are sharing" indicator and Stop | Yes | Yes | Yes, a "you are sharing" bar with Stop above the room tabs | Match |
| End-to-end encrypted, no vendor relay of media | Vendor relays | Vendor relays | Media rides the members' own WireGuard tunnel | Beat |
| Remote mouse and keyboard | Yes | Yes | No | Skip: view only (owner decision) |
| Audio | Yes | Yes | No | Skip: out of scope for 0.1.2 |
| 60 fps game streaming | Yes | No | No, tuned for desktops and apps | Skip: not a game streamer |

## Where Tailshare is ahead

Tailshare is the only tool here that does files, private ports and screen
sharing in one app, with no account, from one short code. None of the rivals
combine all three.
