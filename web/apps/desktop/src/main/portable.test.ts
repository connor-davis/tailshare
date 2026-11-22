import { join, resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  isPortableRun,
  portableDataPath,
  registerRoomProtocol,
} from "./portable"
import { applyLoginItem } from "./login-item"
import { applyExplorerMenu } from "./explorer-menu"

const env = {
  PORTABLE_EXECUTABLE_DIR: resolve("usb"),
  PORTABLE_EXECUTABLE_FILE: resolve("usb", "Tailshare.exe"),
}

describe("portable runs", () => {
  it("detects the original launcher and keeps data beside it", () => {
    expect(isPortableRun({})).toBe(false)
    expect(isPortableRun({ PORTABLE_EXECUTABLE_FILE: "" })).toBe(false)
    expect(portableDataPath({})).toBeNull()
    expect(isPortableRun(env)).toBe(true)
    expect(
      isPortableRun({ PORTABLE_EXECUTABLE_DIR: env.PORTABLE_EXECUTABLE_DIR })
    ).toBe(true)
    expect(portableDataPath(env)).toBe(
      join(env.PORTABLE_EXECUTABLE_DIR, "Tailshare Data")
    )
    expect(
      portableDataPath({
        PORTABLE_EXECUTABLE_FILE: env.PORTABLE_EXECUTABLE_FILE,
      })
    ).toBe(portableDataPath(env))
  })

  it.each([true, false])(
    "never changes OS registrations even when enabled=%s",
    async (enabled) => {
      const host = { setLoginItemSettings: vi.fn() }
      const run = vi.fn(async () => {})
      const register = vi.fn()
      const isPortable = isPortableRun(env)
      applyLoginItem(enabled, {
        packaged: true,
        isPortable,
        execPath: "temp.exe",
        host,
      })
      await applyExplorerMenu(enabled, {
        packaged: true,
        isPortable,
        execPath: "temp.exe",
        run,
      })
      registerRoomProtocol({
        isPortable,
        profile: null,
        defaultApp: false,
        argv: [],
        execPath: "temp.exe",
        register,
      })
      expect(host.setLoginItemSettings).not.toHaveBeenCalled()
      expect(run).not.toHaveBeenCalled()
      expect(register).not.toHaveBeenCalled()
    }
  )

  it("preserves installed and development protocol registration and profile isolation", () => {
    const register = vi.fn()
    const options = {
      isPortable: false,
      profile: null,
      defaultApp: false,
      argv: [],
      execPath: "app.exe",
      register,
    }
    registerRoomProtocol(options)
    expect(register).toHaveBeenLastCalledWith("tailshare")
    registerRoomProtocol({
      ...options,
      defaultApp: true,
      argv: ["electron", "app"],
    })
    expect(register).toHaveBeenLastCalledWith("tailshare", "app.exe", [
      resolve("app"),
    ])
    register.mockClear()
    registerRoomProtocol({ ...options, profile: "second" })
    expect(register).not.toHaveBeenCalled()
  })
})
