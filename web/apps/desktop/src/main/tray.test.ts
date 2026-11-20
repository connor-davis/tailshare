import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

// tray.ts imports Electron for createTray; the pure parts need none of it.
vi.mock("electron", () => ({}))
const { trayIconPaths, trayMenuTemplate } = await import("./tray")

describe("trayMenuTemplate", () => {
  it("has Open and Quit that call their actions", () => {
    const onOpen = vi.fn()
    const onQuit = vi.fn()
    const [open, separator, quit] = trayMenuTemplate({ onOpen, onQuit })
    expect(open?.label).toBe("Open Tailshare")
    expect(separator).toEqual({ type: "separator" })
    expect(quit?.label).toBe("Quit")
    ;(open as { click: () => void }).click()
    ;(quit as { click: () => void }).click()
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onQuit).toHaveBeenCalledOnce()
  })
})

describe("trayIconPaths", () => {
  it("reads build/ in dev and the resources folder when packaged", () => {
    const where = { resourcesPath: "R", appPath: "A" }
    expect(trayIconPaths({ ...where, packaged: false })).toEqual({
      small: join("A", "build", "tray-16.png"),
      large: join("A", "build", "tray-32.png"),
    })
    expect(trayIconPaths({ ...where, packaged: true })).toEqual({
      small: join("R", "tray-16.png"),
      large: join("R", "tray-32.png"),
    })
  })

  it("ships the icons: the installer config copies both next to the app", () => {
    const config = readFileSync(
      join(import.meta.dirname, "../../electron-builder.yml"),
      "utf8"
    )
    for (const name of ["tray-16.png", "tray-32.png"])
      expect(config).toMatch(new RegExp(`from: build/${name}\\s+to: ${name}`))
  })
})
