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
  chrome: "#000000"
  chrome-foreground: "#FFFFFF"
  chrome-muted: "#B8B8BD"
  ring: { light: "#000000", dark: "#FA7A00" }
  radius: "6px"
asymmetries:
  - "Polyphron supplies light colours only; dark values are Tailshare adaptations."
---

# Tailshare design system

## 1. Overview

A compact desktop file manager. Orange identifies actions; neutral surfaces
leave room for names, paths and transfer state. The Spaces shell uses a black
room rail, a home board of recent rooms, and a five-tile room board. Existing session and transfer behavior stays intact.

Source: `D:/Programming/Polyphron/polyphron/DESIGN.md` supplies the exact light
hex values. Viper's console and 3REco's app supply density and component patterns.
The website's marketing layout, square corners and heading sizes do not apply.

## 2. Colors

The frontmatter maps the semantic CSS variables in
`web/apps/desktop/src/renderer/src/styles/globals.css`.
Light background, foreground, card, orange, link, muted text, borders and status
colours are Polyphron source values. Black supplies the light focus ring.
Dark values are Tailshare choices inspired by Viper, not official brand tokens.

Popover uses card colours. Secondary, muted and accent surfaces use white in
light and raised neutral `#1E1E20` in dark, with the normal foreground.
Black `#000000` chrome is shared by both modes: the rail, welcome hero,
room-card headers and code chips. Chrome foreground is white and secondary
text is `#B8B8BD`. Orange on black and black on orange exceed AA contrast.
On black chrome, links use orange and errors use the dark-mode `#FF7B72`
so validation and Forget failures stay readable in both modes.

Normal text needs at least 4.5:1 contrast; large text and meaningful control
boundaries need at least 3:1. Links on light surfaces use `#B85600`.
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

Shell layout: a black room rail with search, New room, Join room, recent rooms,
name and Settings. Home has a black welcome hero with an orange hazard stripe,
then recent-room cards. Saved rooms show last seen, Rejoin and Forget; they do
not claim to be live or show invented occupancy. Active rooms show the actual
member count and eight seats. The room board has Files and People above Chat,
Transfers and Apps. Every tile expands to full view and returns to the board.
Hidden tiles remain mounted so drafts, queue filters and dialogs survive.
At narrow widths the rail is compact and the board stacks into one column.
The window never scrolls; board and tile ScrollAreas own overflow. The top
bar always leaves 138px clear for native caption buttons. Only rail visibility is saved. Retired member, transfer and size preferences
are ignored and left untouched; board expansion is ephemeral.

## 5. Elevation & Depth

The chat and transfers are flat, divided by thin rules. Avoid decorative shadows and nested
cards. Raised input surfaces use the secondary colour. Dialogs and chat sheets
may use a restrained soft shadow when implemented; do not add shadow tokens yet.

## 6. Shapes

Radius is 6px, with 4px small and 8px large derivatives. Avoid pill-shaped primary
controls. Focus uses a 3px ring with 2px offset: black in light, orange in dark
(and on black chrome).
All keyboard actions need visible focus; selection and errors also need words or
shape cues. Disable animation and transitions for prefers-reduced-motion.

## 7. Components

| Component | Contract |
| --- | --- |
| Button | Generated shadcn primitive; semantic colours; dark text on orange; visible keyboard focus; disabled controls cannot trigger actions. |
| Settings | A large shadcn Dialog (solid surface), opened by the gear buttons on the connect screen and the session bar and closed by Esc or the X. A left menu (You, Saving, Transfers, App, Updates) picks the section shown in a ScrollArea on the right. Each setting is a row in a bordered, divided list: words on the left, control (Switch, Select, Input) on the right. Switches and the channel save as soon as they change; text and number fields have a Save button and say why a value is refused. A refused save shows an inline Alert in plain words. A note says limits, name and transfers at once apply from the next update. The shadcn state variants (`data-checked:` and friends) come from `@import "shadcn/tailwind.css"` in `globals.css`; the window itself never scrolls, only ScrollArea does. |
| Updates (in Settings) | Stable is the default; Nightly explicitly opts into development builds. Saving disables the channel; errors stay inline; Check for updates runs one check now (off in development). Available updates show their version and formatted Markdown release notes (small headings, list bullets and muted code backgrounds in both themes; raw HTML and elements outside the release-note allowlist are skipped) before an explicit Download action. The main top bar offers Update available in a no-drag button; its shadcn dialog uses the existing modal surface and ScrollArea with Download and Not now. Not now hides that version only, in memory. Links are underlined; only HTTPS github.com links open the system browser through guarded IPC. Other destinations stay inert; window navigation remains locked. Downloading uses Progress; downloaded updates expose Restart to update. No new tokens or elevation. |
| Cards, alerts, tooltips | Hand-made boxes are gone: notices and errors use shadcn Alert, panels use Card, long names use Tooltip, scrolling uses ScrollArea, progress uses Progress, loading uses Skeleton. |
| Join request | The connect screen shows the pending name as text in a Card. Allow and Deny act on that request ID; both disable while a decision is pending. Errors use an inline Alert. No new tokens, shadows or elevation. |
| Chat composer | A big rounded frame (`bg-field`, `border-border`, `rounded-2xl`) centred at 768px max, pinned under the messages. A growing textarea (about 8 lines, then it scrolls), a ghost `+` button ("Add files") on the left, a round send button ("Send") on the right. Enter sends, Shift+Enter adds a line. Off with a plain hint while nobody else is in the room. Focus shows the ring on the frame. |
| File card | Chat attachment: `bg-card`, `border-border`, `rounded-xl`, 288px wide. File icon in the primary colour, name (truncated, full name in the title), size, then a status: "Shared" for your own file; for theirs a Download button, then a progress bar, then "Saved" or the failure sentence with "Try again". |
| Drop overlay | Dragging files over the chat shows a dashed primary border on `bg-background/85` with "Drop to share". It never takes the pointer, so leaving the chat always clears it. |
| Shell route | `/` composes the rail, home cards and five-tile room board. Existing live data comes over one socket; chat stays in memory. Files uses existing chat attachments and import/drop actions, with no new folder browser. People includes approval and removal, with a text badge in its tile header for a pending request. A request also stays reachable while another tile is expanded. Tile expand and return buttons are labelled and keep keyboard focus. |

The renderer applies `.dark` before React mounts and follows changes to
`prefers-color-scheme`. Settings can force Light or Dark (default System); main sets
`nativeTheme.themeSource`, which flips that query. Inputs use the `--field` fill and `--border`. Native
controls inherit `color-scheme`; both modes use the same layout and spacing.

## 8. Do's and Don'ts

Use semantic tokens and plain action labels. Keep file actions accessible by
keyboard as well as drag and drop. Future routes need loading, empty and error
states. Never use colour alone for status. Keep chat in session memory only.
Do not add charts, fake room status, future mock features or unused scaffolding.
