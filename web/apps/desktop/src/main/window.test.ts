import { describe, expect, it, vi } from "vitest"
import {
  applyLook,
  fixSocketOrigin,
  lockNavigation,
  toggleMaximize,
  windowBackground,
  windowMaterial,
  windowOptions,
  windowState,
  type ControlledWindow,
} from "./window"

describe("windowOptions", () => {
  const options = windowOptions("/app/preload/index.cjs")

  it("turns isolation and the sandbox on and Node off", () => {
    expect(options.webPreferences).toEqual({
      preload: "/app/preload/index.cjs",
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    })
  })

  it("draws no frame, so the page shows its own title bar", () => {
    expect(options.frame).toBe(false)
  })

  it("asks for Mica with a see-through window", () => {
    const mica = windowOptions("/p", { material: "mica", dark: true })

    expect(mica.backgroundMaterial).toBe("mica")
    expect(mica.backgroundColor).toBe("#00000000")
  })

  it("falls back to a solid theme colour, never white in dark mode", () => {
    const light = windowOptions("/p", { material: "none", dark: false })
    const dark = windowOptions("/p", { material: "none", dark: true })

    expect(light.backgroundMaterial).toBe("none")
    expect(light.backgroundColor).toBe("#faf9f6")
    expect(dark.backgroundColor).toBe("#0f0f10")
  })

  it("never relaxes web security", () => {
    const prefs = options.webPreferences as Record<string, unknown>

    expect(prefs.webSecurity).toBeUndefined()
    expect(prefs.allowRunningInsecureContent).toBeUndefined()
    expect(prefs.nodeIntegrationInWorker).toBeUndefined()
  })
})

describe("lockNavigation", () => {
  it("denies new windows and blocks navigation, redirects and webviews", () => {
    const listeners = new Map<string, (e: { preventDefault(): void }) => void>()
    let openHandler: (() => { action: string }) | undefined
    lockNavigation({
      setWindowOpenHandler: (handler) => void (openHandler = handler),
      on: (event, listener) => void listeners.set(event, listener),
    })

    expect(openHandler?.()).toEqual({ action: "deny" })
    for (const event of [
      "will-navigate",
      "will-redirect",
      "will-attach-webview",
    ]) {
      const preventDefault = vi.fn()
      listeners.get(event)?.({ preventDefault })
      expect(preventDefault, event).toHaveBeenCalledOnce()
    }
  })
})

describe("fixSocketOrigin", () => {
  it("turns file:// into null and leaves other origins alone", () => {
    expect(fixSocketOrigin({ Origin: "file://" })).toEqual({ Origin: "null" })
    expect(fixSocketOrigin({ Origin: "http://localhost:5173" })).toEqual({
      Origin: "http://localhost:5173",
    })
    expect(fixSocketOrigin({ Host: "x" })).toEqual({ Host: "x" })
  })
})

describe("windowMaterial", () => {
  it("gives Mica on Windows 11 when the setting is on", () => {
    expect(windowMaterial(true, "10.0.26300", "win32")).toBe("mica")
    expect(windowMaterial(true, "10.0.22621", "win32")).toBe("mica")
  })

  it("gives none on Windows 10", () => {
    expect(windowMaterial(true, "10.0.19045", "win32")).toBe("none")
    expect(windowMaterial(true, "10.0.22000", "win32")).toBe("none")
  })

  it("gives none when the setting is off", () => {
    expect(windowMaterial(false, "10.0.26300", "win32")).toBe("none")
  })

  it("gives none on another system or an unreadable release", () => {
    expect(windowMaterial(true, "10.0.26300", "linux")).toBe("none")
    expect(windowMaterial(true, "23.1.0", "darwin")).toBe("none")
    expect(windowMaterial(true, "", "win32")).toBe("none")
    expect(windowMaterial(true, "10.0.x", "win32")).toBe("none")
  })
})

describe("windowBackground", () => {
  it("is see-through for Mica and a theme colour otherwise", () => {
    expect(windowBackground({ material: "mica", dark: false })).toBe(
      "#00000000"
    )
    expect(windowBackground({ material: "none", dark: false })).toBe("#faf9f6")
    expect(windowBackground({ material: "none", dark: true })).toBe("#0f0f10")
  })
})

describe("window controls", () => {
  function fake(maximized: boolean) {
    const calls: string[] = []
    const window: ControlledWindow = {
      isMaximized: () => maximized,
      maximize: () => void calls.push("maximize"),
      unmaximize: () => void calls.push("unmaximize"),
      setBackgroundMaterial: (m) => void calls.push(`material:${m}`),
      setBackgroundColor: (c) => void calls.push(`color:${c}`),
    }
    return { window, calls }
  }

  it("maximises a normal window and restores a maximised one", () => {
    const normal = fake(false)
    toggleMaximize(normal.window)
    expect(normal.calls).toEqual(["maximize"])

    const full = fake(true)
    toggleMaximize(full.window)
    expect(full.calls).toEqual(["unmaximize"])
  })

  it("switches the live material and the colour together", () => {
    const { window, calls } = fake(false)

    applyLook(window, { material: "none", dark: true })
    applyLook(window, { material: "mica", dark: true })

    expect(calls).toEqual([
      "material:none",
      "color:#0f0f10",
      "material:mica",
      "color:#00000000",
    ])
  })

  it("reports maximised and whether Mica is really on", () => {
    expect(
      windowState(fake(true).window, { material: "mica", dark: false })
    ).toEqual({ maximized: true, mica: true })
    expect(
      windowState(fake(false).window, { material: "none", dark: false })
    ).toEqual({ maximized: false, mica: false })
  })
})
