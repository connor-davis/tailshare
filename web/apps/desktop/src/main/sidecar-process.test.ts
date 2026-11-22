import { describe, expect, it, vi } from "vitest"
import { newToken, spawnSidecar } from "./sidecar-process"

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock("node:child_process", () => ({ spawn }))

describe("real sidecar spawn identity", () => {
  const child = () => ({
    stderr: { resume: vi.fn() },
    stdout: { setEncoding: vi.fn() },
    stdin: { on: vi.fn() },
    once: vi.fn(),
  })

  it("hands the join key to the sidecar only when there is one", () => {
    spawn.mockReturnValue(child())
    const identity = `privkey:${"ab".repeat(32)}`

    spawnSidecar("tailshare.exe", "t", "C:/rooms", "m", identity)
    expect(spawn.mock.lastCall?.[2].env.TAILSHARE_IDENTITY).toBe(identity)

    spawnSidecar("tailshare.exe", "t", "C:/rooms", "m")
    expect("TAILSHARE_IDENTITY" in spawn.mock.lastCall![2].env).toBe(false)
  })
})

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

it("starts with the saved relay preference while preserving the identity argument", () => {
  spawn.mockReturnValue({
    stderr: { resume: vi.fn() },
    stdout: { setEncoding: vi.fn() },
    stdin: { on: vi.fn() },
    once: vi.fn(),
  })
  spawnSidecar("tailshare.exe", "t", "C:/rooms", "m", undefined, "nearest")
  expect(spawn.mock.lastCall?.[2].env.TAILSHARE_REGION).toBe("nearest")
})
