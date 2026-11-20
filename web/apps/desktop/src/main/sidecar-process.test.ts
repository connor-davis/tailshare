import { describe, expect, it, vi } from "vitest"
import { newToken, spawnSidecar } from "./sidecar-process"

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock("node:child_process", () => ({ spawn }))

describe("real sidecar spawn environment", () => {
  it("passes both secrets and the persistent rooms directory in dev too", () => {
    spawn.mockReturnValue({
      stderr: { resume: vi.fn() },
      stdout: { setEncoding: vi.fn() },
      stdin: { on: vi.fn() },
      once: vi.fn(),
    })
    const token = newToken()
    const mainToken = newToken()
    expect(mainToken).not.toBe(token)
    spawnSidecar(
      "D:/App/bin/tailshare.exe",
      token,
      "C:/User/Tailshare/rooms",
      mainToken
    )
    expect(spawn).toHaveBeenCalledWith(
      "D:/App/bin/tailshare.exe",
      ["serve"],
      expect.objectContaining({
        env: expect.objectContaining({
          TAILSHARE_ADDR: "127.0.0.1:0",
          TAILSHARE_TOKEN: token,
          TAILSHARE_MAIN_TOKEN: mainToken,
          TAILSHARE_ROOMS_DIR: "C:/User/Tailshare/rooms",
        }),
        windowsHide: true,
      })
    )
  })
})
