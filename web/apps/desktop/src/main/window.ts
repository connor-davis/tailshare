import type { BrowserWindowConstructorOptions } from "electron"
import type { WindowState } from "../shared/bridge"

/** The first Windows 11 build (22H2) where Electron's backgroundMaterial works. */
const WINDOWS_11_BUILD = 22621

/** The material behind the window: Mica, or none (a solid colour). */
export type WindowMaterial = "mica" | "none"

/**
 * Mica needs the setting on and Windows 11. `release` is `os.release()`, such
 * as `10.0.26300`; the build number is its third part. Anything else, such as
 * Windows 10 or a release we cannot read, gets no material.
 */
export function windowMaterial(
  mica: boolean,
  release: string,
  platform: string = process.platform
): WindowMaterial {
  const build = Number(release.split(".")[2])

  return mica && platform === "win32" && build >= WINDOWS_11_BUILD
    ? "mica"
    : "none"
}

/** The background tokens in globals.css, for the window behind the page. */
const SOLID = { light: "#faf9f6", dark: "#0f0f10" } as const

/** How the window looks behind the page. */
export interface WindowLook {
  readonly material: WindowMaterial
  /** The system is in dark mode. Only the solid fallback uses it. */
  readonly dark: boolean
}

/**
 * Mica needs a see-through window. Without it, `none` paints white, so the
 * fallback gets a real colour from the theme.
 */
export function windowBackground(look: WindowLook): string {
  if (look.material === "mica") return "#00000000"

  return look.dark ? SOLID.dark : SOLID.light
}

/** Caption symbol colours: the foreground tokens in globals.css. */
const SYMBOL = { light: "#000000", dark: "#ededee" } as const

/** The title bar's height in px (`h-10`). The caption buttons match it. */
const TITLE_BAR_HEIGHT = 40

/**
 * The Windows caption buttons drawn over our title bar. The page paints behind
 * them, so the colour stays see-through; only the symbols follow the theme.
 */
export function titleBarOverlay(look: WindowLook) {
  return {
    color: "#00000000",
    symbolColor: look.dark ? SYMBOL.dark : SYMBOL.light,
    height: TITLE_BAR_HEIGHT,
  }
}

/**
 * Window settings. Isolation and the sandbox are on and Node is off, so the
 * page only reaches what the preload bridge exposes. The title bar is ours,
 * but Windows draws the real minimise, maximise and close buttons over it.
 */
export function windowOptions(
  preload: string,
  look: WindowLook = { material: "none", dark: false }
): BrowserWindowConstructorOptions {
  return {
    title: "Tailshare",
    width: 1100,
    height: 760,
    // Rooms 200 + room 400 + members 200 side by side, and the room's stacked
    // panels, need this much; smaller windows clipped the transfer buttons.
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hidden",
    titleBarOverlay: titleBarOverlay(look),
    backgroundMaterial: look.material,
    backgroundColor: windowBackground(look),
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  }
}

/** The parts of a window that {@link applyLook} touches. */
export interface ControlledWindow {
  setBackgroundMaterial(material: WindowMaterial): void
  setBackgroundColor(color: string): void
  setTitleBarOverlay(options: ReturnType<typeof titleBarOverlay>): void
}

/**
 * Switches a live window between Mica and the solid colour, and recolours the
 * caption symbols to match the theme.
 */
export function applyLook(window: ControlledWindow, look: WindowLook): void {
  window.setBackgroundMaterial(look.material)
  window.setBackgroundColor(windowBackground(look))
  window.setTitleBarOverlay(titleBarOverlay(look))
}

/** What the page is told about its window. */
export function windowState(look: WindowLook): WindowState {
  return { mica: look.material === "mica" }
}

/** The parts of `webContents` that {@link lockNavigation} touches. */
export interface NavigationTarget {
  setWindowOpenHandler(handler: () => { action: "deny" }): void
  on(
    event: "will-navigate" | "will-redirect" | "will-attach-webview",
    listener: (event: { preventDefault(): void }) => void
  ): void
}

const BLOCKED_EVENTS = [
  "will-navigate",
  "will-redirect",
  "will-attach-webview",
] as const

/**
 * Refuses every new window, navigation, redirect and webview. Hash routes need
 * no document navigation, so nothing legitimate is blocked.
 */
export function lockNavigation(contents: NavigationTarget): void {
  contents.setWindowOpenHandler(() => ({ action: "deny" }))

  for (const event of BLOCKED_EVENTS) {
    contents.on(event, (e) => e.preventDefault())
  }
}

/**
 * The sidecar only allows the Origin `null`, which is what fetch sends from a
 * packaged `file://` page. Chromium sends `file://` on a WebSocket, so the
 * socket would get a 403. This swaps that one value, nothing else.
 */
export function fixSocketOrigin(
  headers: Record<string, string>
): Record<string, string> {
  return headers.Origin === "file://" ? { ...headers, Origin: "null" } : headers
}
