## Scope Brief — Tailshare 0.1.x: public repo, releases, auto-update, group shares

> **Goal:**
> `/goal Publish Tailshare as the public repo connor-davis/tailshare with a 0.1.0 GitHub release (today's app plus auto-update and a new logo), branch rules connor_davis/* -> develop -> main, stable releases from main and nightly pre-releases from develop, then ship the 0.1.x features (group shares where everyone links to everyone with host-approved joins and 8-character codes, a share space with per-person downloads to a chosen save folder, settings, tray, custom title bar, Mica, shadcn-only UI) as auto-updates (Windows only, no code signing); done when a 0.1.0 install auto-updates to the next 0.1.x, three PCs share files in one session, and task check is green on every PR.`

### 1. Objective

Make Tailshare public and self-updating, then turn it from a two-PC tool into a
group share: one person starts it, others join with a code, everyone puts files
into one shared space, and each person downloads what they want.

### 2. In Scope

**Release track (0.1.0)**

- Make `connor-davis/tailshare` a public GitHub repo. Push the history, `main`
  and `develop`. Check the history for secrets and local-only files first.
- Branch flow: `connor_davis/<name>` → PR into `develop` → PR into `main`.
  - Rulesets on `main` and `develop`: changes only through PRs, no force-push
    and no deleting the branch, and `task check` CI must pass.
  - A CI check allows only `develop` into `main`, and only `connor_davis/*`
    into `develop`.
  - Update AGENTS.md (which still says `cd/...`).
- GitHub Actions on Windows:
  - **CI** runs `task check` on every PR.
  - **Stable:** a `v0.1.x` tag on `main` builds the installer and publishes a
    GitHub Release with the installer, `latest.yml` and the blockmap.
  - **Nightly:** every push to `develop` builds and publishes a pre-release
    (`0.1.x-nightly.<timestamp>`).
- Auto-update with `electron-updater` from GitHub Releases.
  - The app checks on start and every few hours. It downloads in the
    background, then shows "Restart to update".
  - Settings has "Updates: Stable / Nightly", with Stable as the default.
    Nightly users get every new develop build.
- New logo: an SVG made for Tailshare, exported to `.ico` and `.png` for the
  app, the installer and the tray.
- Version `0.1.0`. Stay on `0.1.x` until a bigger step makes sense.
- The two-PC proof record is closed with "owner confirmed it works". No more
  proof steps.

**Features (0.1.1 and later 0.1.x, shipped as auto-updates)**

- **Group shares.** The person who makes the code starts the share, and
  others join with it.
  - Everyone links to everyone (a full mesh).
  - The code stays open while the share is open. A join request shows
    "Allow / Deny" to the host.
  - **The share closes when only one person is left.** The host is not
    special after it starts the share: if the host leaves while two or more
    people remain, the share goes on.
- **8-character codes**, like `7K3Q-9PXM`. They use the same alphabet, Argon2
  settings and salt as before. This breaks 0.1.0 ↔ 0.1.1 sessions on purpose;
  auto-update moves everyone.
- **Share space instead of folder panes.** Nobody picks a folder to share.
  - Each person adds files to one shared space, and everyone sees one list.
  - Each person clicks Download to get a file. It comes straight from the
    person who shared it.
  - A file leaves the list when its sharer removes it or leaves.
- **Save folder.**
  - Downloads go to the app's folder by default.
  - Settings can change it to another folder, or to "ask every time" (like a
    browser).
- **Settings page:**
  - display name (default: the computer name)
  - save folder
  - upload and download speed limits
  - transfers at once
  - start with Windows
  - close to tray
  - update channel
  - background effect on or off
- **System tray:** an icon with Open / Quit. Closing the window can hide it to
  the tray.
- **Custom title bar:** a frameless window with our own drag area and
  minimise / maximise / close buttons, built from shadcn parts.
- **Transparent background:** Windows 11 Mica, with a plain background on
  Windows 10 or when the setting is off.
- **UI:** shadcn components everywhere. Custom parts may only be built from
  shadcn parts.
  - `ScrollArea` replaces native scrollbars.
  - Resizable panels where they make sense: the people list, the share space,
    chat, and the transfer dock.
  - Light and dark.

### 3. Out of Scope (explicit non-goals)

- macOS and Linux builds.
- Code signing. Releases stay unsigned, and the SmartScreen note stays.
- Accounts, servers of our own, and saved chat history. Chat stays in memory.
- Folders in the share space. It holds files only.
- Moving to 0.2 / 1.0 during this work.
- Agents merging PRs. The owner merges.

### 4. Deliverables

| Artifact | Format / location | Notes |
|----------|-------------------|-------|
| Public repo + rulesets | GitHub `connor-davis/tailshare` | `main`, `develop`, PR-only, CI required, branch-flow check |
| CI, stable and nightly workflows | `.github/workflows/*.yml` | Windows runners; `task check`; electron-builder `--publish` |
| Auto-update | `web/apps/desktop/src/main/updater.ts` + publish config in `electron-builder.yml` | electron-updater; stable or nightly channel |
| Logo | `web/apps/desktop/build/logo.svg` → `icon.ico`, tray PNGs | replaces the Polyphron placeholder |
| 0.1.0 release | GitHub Release `v0.1.0` | installer, `latest.yml`, blockmap |
| Mesh sessions + 8-char codes + host approval | `internal/services/codes`, `session`, `peer` | security.md and protocol.md updated |
| Share space + save folder | `internal/services/transfer`, `share`, `internal/api`, renderer routes | replaces two-pane browsing |
| Settings, tray, title bar, Mica | Electron main + renderer `/settings` | settings stored in Electron's user-data folder |
| shadcn sweep | renderer components | ScrollArea and Resizable everywhere it fits |
| Docs | AGENTS.md, docs/*, README | branch flow, release flow, new protocol |

### 5. Constraints

- Windows x64 only. Unsigned. Per-user NSIS with no elevation.
- No git worktrees. Containers, if ever needed, run through Kiri `docker`.
- Every path or ID a peer sends is checked, with an escape test.
- Live data goes over the WebSocket only, never through polling.
- No file over 900 lines. Comments follow the style guide.
- Sub-agents follow AGENTS.md Orchestrator V2 rules: medium effort, round robin.
- Tailcat v0.7.0 can't drop a connected peer. A mesh member leaving has to be
  handled by closing that person's links.

### 6. Success Criteria (Definition of Done)

- [ ] `connor-davis/tailshare` is public. The `v0.1.0` release has the
      installer and `latest.yml`.
- [ ] A direct push to `main` or `develop` is refused. A PR into `main` from
      anything except `develop` fails its check.
- [ ] A 0.1.0 install updates itself to the next 0.1.x release. A nightly
      opt-in install updates to a develop pre-release.
- [ ] Three PCs join one share with an 8-character code, and the host allows
      each join. Each PC adds a file, and the others download it, with SHA-256
      matching.
- [ ] The share stays open when the host leaves with 2+ left, and closes when
      one person is left.
- [ ] Downloads land in the chosen save folder, or ask every time when set.
- [ ] Settings, tray, title bar and Mica work, in light and dark.
- [ ] `task check` is green on every PR.

### 7. Audience / Context

The owner and the people they share files with, on Windows. The app is public
on GitHub and anyone can download it.

### 8. Open Assumptions (veto any)

- If the host leaves, the person who joined earliest takes over Allow / Deny.
  This works because any member can run the code's server: the code alone
  makes its keys.
- A share holds at most 8 people.
- The default save folder is `Downloads\Tailshare`.
- A download from a person who leaves mid-transfer fails. It can resume if
  they share the file again.
- Rulesets need no PR approvals, so the owner can merge their own PRs.
  Admins can't bypass them.
- I'll draw 2–3 logo ideas and you pick one before it goes into the build.

### 9. Confidence (final)

| Area | Score |
|------|-------|
| Objective | 90 |
| Boundaries | 85 |
| Deliverables | 85 |
| Constraints | 85 |
| Success | 85 |
| Audience | 90 |

### 10. User notes captured during scoping

- "also till it makes sense we stay on 0.1.x"
- "Open while share is open, host allows each, uhm, but we can have longer codes if necessary"
- "When there are 2 people left in the session, if one leaves the share closes, the host just initiates the share"
- "Opt-in switch in settings, whenever there is a new release on develop nightly opt-in users get to download the new update"
- "dont need a proof record I would say other than me saying it works"
