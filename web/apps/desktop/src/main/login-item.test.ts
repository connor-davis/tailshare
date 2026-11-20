import { describe, expect, it, vi } from "vitest"
import { applyLoginItem } from "./login-item"

const EXE = "C:\\Users\\me\\AppData\\Local\\Programs\\Tailshare\\Tailshare.exe"

describe("applyLoginItem", () => {
  it.each([true, false])(
    "registers %s with --hidden when packaged",
    (enabled) => {
      const host = { setLoginItemSettings: vi.fn() }
      applyLoginItem(enabled, { packaged: true, execPath: EXE, host })
      expect(host.setLoginItemSettings).toHaveBeenCalledExactlyOnceWith({
        openAtLogin: enabled,
        path: EXE,
        args: ["--hidden"],
      })
    }
  )

  it("never touches the login list in a dev run", () => {
    const host = { setLoginItemSettings: vi.fn() }
    applyLoginItem(true, { packaged: false, execPath: "electron.exe", host })
    expect(host.setLoginItemSettings).not.toHaveBeenCalled()
  })
})
