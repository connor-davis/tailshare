import { describe, expect, it, vi } from "vitest"
import { fixSocketOrigin, lockNavigation, windowOptions } from "./window"

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
