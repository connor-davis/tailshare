/** What to do when the window is asked to close. */
export type CloseAction = "hide" | "allow"

/**
 * Close to tray hides the window, unless the app is on its way out (a quit,
 * or an update restart), when the window must be allowed to go.
 */
export function closeAction(state: {
  readonly closeToTray: boolean
  readonly quitting: boolean
}): CloseAction {
  return state.closeToTray && !state.quitting ? "hide" : "allow"
}

/** Whether the app quits once every window is closed. */
export function quitWhenAllClosed(state: {
  readonly platform: string
  readonly closeToTray: boolean
}): boolean {
  return state.platform !== "darwin" && !state.closeToTray
}

/** Windows starts us with `--hidden` when "Start with Windows" is on. */
export const startsHidden = (argv: readonly string[]) =>
  argv.includes("--hidden")

/** The parts of a window that the shell touches. */
export interface ShellWindow {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  hide(): void
  on(
    event: "close",
    listener: (event: { preventDefault(): void }) => void
  ): void
}

/** Brings the window back: restore if minimised, show, focus. */
export function showWindow(window: ShellWindow | null): void {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

/** Makes the close button hide the window when the rules say so. */
export function hideOnClose(
  window: ShellWindow,
  state: () => { closeToTray: boolean; quitting: boolean }
): void {
  window.on("close", (event) => {
    if (closeAction(state()) !== "hide") return
    event.preventDefault()
    window.hide()
  })
}
