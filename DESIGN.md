---
project: Tailshare
families: [desktop]
modes: [light, dark]
themes:
  tailshare: { family: desktop, notes: "Polyphron light; Viper-inspired dark" }
tokens:
  background: { light: "#FAF9F6", dark: "#0F0F10" }
  foreground: { light: "#000000", dark: "#EDEDEE" }
  card: { light: "#FFFFFF", dark: "#171718" }
  primary: "#FA7A00"
  primary-foreground: { light: "#000000", dark: "#0F0F10" }
  link: { light: "#B85600", dark: "#FA7A00" }
  muted-foreground: { light: "#3D4650", dark: "#A1A1A7" }
  border: { light: "#D0D0CE", dark: "#262629" }
  input: { light: "#858585", dark: "#6B6B72" }
  destructive: { light: "#D3212C", dark: "#FF7B72" }
  warning: { light: "#CA8A04", dark: "#E8C547" }
  success: { light: "#24963E", dark: "#3DD68C" }
  ring: { light: "#0F1C2E", dark: "#FA7A00" }
  radius: "6px"
asymmetries:
  - "Polyphron supplies light colours only; dark values are Tailshare adaptations."
---

# Tailshare design system

## 1. Overview

A compact desktop file manager. Orange identifies actions; neutral surfaces
leave room for names, paths and transfer state. The current shell contains only
the Tailshare title and a disabled connection placeholder. The layout below is
the contract for step 11, not an implemented session screen.

Source: `D:/Programming/Polyphron/polyphron/DESIGN.md` supplies the exact light
hex values. Viper's console and 3REco's app supply density and component patterns.
The website's marketing layout, square corners and heading sizes do not apply.

## 2. Colors

The frontmatter maps the semantic CSS variables in
`web/apps/desktop/src/renderer/src/styles/globals.css`.
Light background, foreground, card, orange, link, muted text, borders and status
colours are Polyphron source values. Blueprint Navy supplies the light focus ring.
Dark values are Tailshare choices inspired by Viper, not official brand tokens.

Popover uses card colours. Secondary, muted and accent surfaces use white in
light and raised neutral `#1E1E20` in dark, with the normal foreground. The top
bar's future dark surface is `#141415`. Use `#0F1C2E` sparingly for emphasis.
Keep these future layout values in this document until the corresponding UI exists.

Normal text needs at least 4.5:1 contrast; large text and meaningful control
boundaries need at least 3:1. Light links use `#B85600`, never bright orange.
Primary orange buttons use dark text. Source warning and success colours are
signals, not small text on light surfaces; pair them with readable foreground
labels and explicit words. Low-contrast separator colours must not be the sole
way to identify an interactive control. Disabled controls remain visibly disabled.

## 3. Typography

Use the installed system UI stack: Segoe UI on Windows, then system-ui and
sans-serif. This keeps the desktop shell offline and matches native file tools.
Use 14px body and file names, 13px metadata and 20px semibold page titles.
Paths and connection codes may use a system monospace stack. Sizes, speeds and
progress use tabular numerals. Truncated file names need an accessible full name.

## 4. Layout & spacing

Use 4, 8, 12, 16, 24 and 32px spacing. Group a label and control tightly; separate
unrelated actions. Controls have at least 32px hit height; compact rows retain
keyboard access. Use 6px control corners, 4px small corners and 8px dialogs.

Shell layout:

```text
+ Rooms ----+ Peer / status      Leave ------+ Members -----+
| New room  | [Files] [Chat]                 | You (host)   |
| Recent    | Local folder   | Peer folder   | Pat   Host   |
| Folder    | file rows      | file rows     |              |
| Name, gear+ Transfers: active / done -------+--------------+
+-----------+ queue rows                                    |
+-------------------------------------------------------------+
```

Rooms shell: a rooms sidebar (plain aside, 180-360px), the room in the middle
(56px header, Files and Chat tabs, a 180px transfers panel that collapses to its
40px header) and a members column (160-360px). Every column is resizable and
collapsible, and sizes are saved per computer. Files panes are at least 200px
wide. ponytail: below 720px the columns do not stack yet.

## 5. Elevation & Depth

File panes are flat, divided by thin rules. Avoid decorative shadows and nested
cards. Raised input surfaces use the secondary colour. Dialogs and chat sheets
may use a restrained soft shadow when implemented; do not add shadow tokens yet.

## 6. Shapes

Radius is 6px, with 4px small and 8px large derivatives. Avoid pill-shaped primary
controls. Focus uses a 3px ring with 2px offset: navy in light, orange in dark.
All keyboard actions need visible focus; selection and errors also need words or
shape cues. Respect reduced motion and do not add motion to this placeholder.

## 7. Components

| Component | Contract |
| --- | --- |
| Button | Generated shadcn primitive; semantic colours; dark text on orange; visible keyboard focus; disabled controls cannot trigger actions. |
| Settings | A large shadcn Dialog (solid surface), opened by the gear buttons on the connect screen and the session bar and closed by Esc or the X. A left menu (You, Saving, Transfers, App, Updates) picks the section shown in a ScrollArea on the right. Each setting is a row in a bordered, divided list: words on the left, control (Switch, Select, RadioGroup, Input) on the right. Switches, the save mode and the channel save as soon as they change; text and number fields have a Save button and say why a value is refused. A refused save shows an inline Alert in plain words. A note says limits, name and transfers at once apply from the next update. The shadcn state variants (`data-checked:` and friends) come from `@import "shadcn/tailwind.css"` in `globals.css`; the window itself never scrolls, only ScrollArea does. |
| Updates (in Settings) | Stable is the default; Nightly explicitly opts into development builds. Saving disables the channel; errors stay inline; Check for updates runs one check now (off in development). Available updates show their version and formatted Markdown release notes (small headings, list bullets and muted code backgrounds in both themes; raw HTML and elements outside the release-note allowlist are skipped) before an explicit Download action. The main top bar offers Update available in a no-drag button; its shadcn dialog uses the existing modal surface and ScrollArea with Download and Not now. Not now hides that version only, in memory. Links are underlined; only HTTPS github.com links open the system browser through guarded IPC. Other destinations stay inert; window navigation remains locked. Downloading uses Progress; downloaded updates expose Restart to update. No new tokens or elevation. |
| Cards, alerts, tooltips | Hand-made boxes are gone: notices and errors use shadcn Alert, panels use Card, long names use Tooltip, scrolling uses ScrollArea, progress uses Progress, loading uses Skeleton. |
| Join request | The connect screen shows the pending name as text in a Card. Allow and Deny act on that request ID; both disable while a decision is pending. Errors use an inline Alert. No new tokens, shadows or elevation. |
| Shell route | `/` is the whole app: rooms sidebar with recent rooms, the open room with Files and Chat tabs, transfers panel, and the members column (host marked with the word Host). Live data comes over one socket; chat stays in memory. |

The renderer applies `.dark` before React mounts and follows changes to
`prefers-color-scheme`. Settings can force Light or Dark (default System); main sets
`nativeTheme.themeSource`, which flips that query. Inputs use the `--field` fill and `--border`. Native
controls inherit `color-scheme`; both modes use the same layout and spacing.

## 8. Do's and Don'ts

Use semantic tokens and plain action labels. Keep file actions accessible by
keyboard as well as drag and drop. Future routes need loading, empty and error
states. Never use colour alone for status. Keep chat in session memory only.
Do not add charts, sidebar tokens or unused component scaffolding.
