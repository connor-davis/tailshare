import { describe, expect, it, vi } from "vitest"
import {
  closeAction,
  hideOnClose,
  quitWhenAllClosed,
  showWindow,
  startsHidden,
  type ShellWindow,
} from "./lifecycle"

type CloseEvent = { preventDefault(): void }

function fakeWindow(over: Partial<ShellWindow> = {}) {
  let onClose: (event: CloseEvent) => void = () => {}
  const window: ShellWindow = {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    on: (_event, listener) => void (onClose = listener),
    ...over,
  }
  return { window, close: (event: CloseEvent) => onClose(event) }
}

describe("closeAction", () => {
  it.each([
    [true, false, "hide"],
    [true, true, "allow"],
    [false, false, "allow"],
    [false, true, "allow"],
  ] as const)(
    "closeToTray %s, quitting %s gives %s",
    (closeToTray, quitting, want) => {
      expect(closeAction({ closeToTray, quitting })).toBe(want)
    }
  )
})

describe("hideOnClose", () => {
  it("cancels the close and hides the window", () => {
    const { window, close } = fakeWindow()
    const preventDefault = vi.fn()
    hideOnClose(window, () => ({ closeToTray: true, quitting: false }))
    close({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(window.hide).toHaveBeenCalledOnce()
  })

  it("lets the window close while quitting or when the setting is off", () => {
    const state = { closeToTray: true, quitting: true }
    const { window, close } = fakeWindow()
    const preventDefault = vi.fn()
    hideOnClose(window, () => state)
    close({ preventDefault })
    state.quitting = false
    state.closeToTray = false
    close({ preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
    expect(window.hide).not.toHaveBeenCalled()
  })

  it("reads the setting at close time, so a change applies at once", () => {
    const state = { closeToTray: false, quitting: false }
    const { window, close } = fakeWindow()
    const preventDefault = vi.fn()
    hideOnClose(window, () => state)
    state.closeToTray = true
    close({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
  })
})

describe("quitWhenAllClosed", () => {
  it("quits unless close to tray is on, and never on macOS", () => {
    const win = { platform: "win32", closeToTray: false }
    expect(quitWhenAllClosed(win)).toBe(true)
    expect(quitWhenAllClosed({ ...win, closeToTray: true })).toBe(false)
    expect(quitWhenAllClosed({ ...win, platform: "darwin" })).toBe(false)
  })
})

describe("showWindow", () => {
  it("restores a minimised window, shows and focuses it", () => {
    const { window } = fakeWindow({ isMinimized: () => true })
    showWindow(window)
    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it("does not restore a window that is not minimised", () => {
    const { window } = fakeWindow()
    showWindow(window)
    expect(window.restore).not.toHaveBeenCalled()
    expect(window.show).toHaveBeenCalledOnce()
  })

  it("does nothing without a window or with a destroyed one", () => {
    const { window } = fakeWindow({ isDestroyed: () => true })
    expect(() => showWindow(null)).not.toThrow()
    showWindow(window)
    expect(window.show).not.toHaveBeenCalled()
  })
})

describe("startsHidden", () => {
  it("is true only with --hidden", () => {
    expect(startsHidden(["Tailshare.exe", "--hidden"])).toBe(true)
    expect(startsHidden(["Tailshare.exe"])).toBe(false)
  })
})
