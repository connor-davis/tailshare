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
  input: { light: "#C0C0C0", dark: "#36363A" }
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

Planned session layout:

```text
+ Tailshare | peer / status | Host | Join code | Connect --------+
| Local folder / breadcrumb      | Peer folder / breadcrumb      |
| Name     Size     Modified     | Name     Size     Modified    |
| file rows                      | file rows                     |
+ Transfers | Active / Complete | progress / pause / retry ------+
| queue dock                                      [Chat sheet]  |
+---------------------------------------------------------------+
```

No permanent navigation sidebar. Start with equal resizable panes, each at least
280px wide, a 56px connection bar and a 180px queue dock that can collapse to its
40px header. Below 720px, stack panes and expose queue/chat as accessible overlays.
These dimensions are Tailshare-derived starting values for step 11.

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
| Shell route | One title and disabled connection placeholder; Query and hash router providers; no connection behavior until step 11. |

The renderer applies `.dark` before React mounts and follows changes to
`prefers-color-scheme`. There is no saved override or theme switch yet. Native
controls inherit `color-scheme`; both modes use the same layout and spacing.

## 8. Do's and Don'ts

Use semantic tokens and plain action labels. Keep file actions accessible by
keyboard as well as drag and drop. Future routes need loading, empty and error
states. Never use colour alone for status. Keep chat in session memory only.
Do not add charts, sidebar tokens or unused component scaffolding.
