import type { BrowserWindowConstructorOptions } from "electron"

/**
 * Window settings. Isolation and the sandbox are on and Node is off, so the
 * page only reaches what the preload bridge exposes.
 */
export function windowOptions(
  preload: string
): BrowserWindowConstructorOptions {
  return {
    title: "Tailshare",
    width: 1100,
    height: 760,
    minWidth: 480,
    minHeight: 360,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  }
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
