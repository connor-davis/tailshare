import { describe, expect, it, vi } from "vitest"
import type { TrustedComputer } from "../shared/bridge"
import { CHANNELS } from "../shared/ipc-schema"
import { createTrusted, registerTrustedIpc, MAX_TRUSTED } from "./trusted"

const KEY = `nodekey:${"a".repeat(64)}`
const OTHER = `nodekey:${"b".repeat(64)}`

function setup(start: TrustedComputer[] = [], answer: unknown = undefined) {
  let saved = start
  const calls: string[] = []
  const push = vi.fn(async (body: { keys: string[] }) => {
    calls.push(`push:${body.keys.length}`)
  })
  const allow = vi.fn(async () => void calls.push("allow"))
  const joinKey = vi.fn(async () =>
    answer === undefined
      ? { key: KEY, displayName: "  Laptop ", fingerprint: "0123456789ab" }
      : answer
  )
  const trusted = createTrusted({
    settings: {
      get: () => ({ trustedComputers: saved }),
      update: (patch) => void (saved = patch.trustedComputers),
    },
    push,
    joinKey,
    allow,
    now: () => 1234,
  })

  return { trusted, push, allow, joinKey, calls, saved: () => saved }
}

describe("trust", () => {
  it("saves the key, pushes the list, then allows", async () => {
    const t = setup()

    await t.trusted.trust(7)

    expect(t.saved()).toEqual([
      { key: KEY, label: "Laptop", addedAt: 1234, fingerprint: "0123456789ab" },
    ])
    expect(t.calls).toEqual(["push:1", "allow"])
    expect(t.allow).toHaveBeenCalledWith(7)
  })

  it("keeps the first added date when trusted again", async () => {
    const t = setup([{ key: KEY, label: "Old", addedAt: 5 }])

    await t.trusted.trust(7)

    expect(t.saved()).toHaveLength(1)
    expect(t.saved()[0]).toMatchObject({ label: "Laptop", addedAt: 5 })
  })

  it("fails on a stale id and saves nothing", async () => {
    const t = setup()
    t.joinKey.mockRejectedValueOnce(
      new Error("That join request is no longer waiting.")
    )

    await expect(t.trusted.trust(7)).rejects.toThrow("no longer waiting")

    expect(t.saved()).toEqual([])
    expect(t.allow).not.toHaveBeenCalled()
  })

  it("refuses a bad id and a bad sidecar answer", async () => {
    for (const bad of [0, -1, 1.5, "7", null])
      await expect(setup().trusted.trust(bad)).rejects.toThrow("could not")

    const t = setup([], { key: "nodekey:zz", displayName: "x" })
    await expect(t.trusted.trust(7)).rejects.toThrow("could not")
    expect(t.saved()).toEqual([])
  })

  it("uses a plain label when the name is blank", async () => {
    const t = setup([], { key: KEY, displayName: "   " })

    await t.trusted.trust(1)

    expect(t.saved()[0].label).toBe("Computer")
  })

  it("stops at the cap", async () => {
    const full = Array.from({ length: MAX_TRUSTED }, (_, i) => ({
      key: `nodekey:${String(i).padStart(64, "0")}`,
      label: "x",
      addedAt: 0,
    }))
    const t = setup(full)

    await expect(t.trusted.trust(1)).rejects.toThrow("up to 100")
    expect(t.allow).not.toHaveBeenCalled()
  })

  it("keeps the trust when the final allow fails", async () => {
    const t = setup()
    t.allow.mockRejectedValueOnce(new Error("expired"))

    await expect(t.trusted.trust(7)).rejects.toThrow("expired")

    expect(t.saved()).toHaveLength(1)
  })
})

describe("revoke and apply", () => {
  it("removes by exact key only", () => {
    const t = setup([
      { key: KEY, label: "a", addedAt: 0 },
      { key: OTHER, label: "b", addedAt: 0 },
    ])

    t.trusted.revoke(KEY)

    expect(t.saved().map((c) => c.key)).toEqual([OTHER])
    expect(() => t.trusted.revoke("nodekey:short")).toThrow("could not")
  })

  it("never rejects when the sidecar refuses", async () => {
    const t = setup()
    t.push.mockRejectedValueOnce(new Error("down"))

    await expect(t.trusted.apply()).resolves.toBeUndefined()
  })
})

describe("trust ipc", () => {
  it("guards sender and argument count", async () => {
    const handlers = new Map<
      string,
      (ok: boolean, args: unknown[]) => Promise<unknown>
    >()
    const t = setup()
    registerTrustedIpc(
      {
        handle: (c, h) => void handlers.set(c, h),
        pickFolder: async () => null,
      },
      t.trusted
    )

    const trust = handlers.get(CHANNELS.trustJoin)!
    await expect(trust(false, [7])).rejects.toThrow("answer this window")
    await expect(trust(true, [])).rejects.toThrow("read that request")
    await expect(trust(true, [7, 8])).rejects.toThrow("read that request")
    await trust(true, [7])

    expect(t.saved()).toHaveLength(1)

    await handlers.get(CHANNELS.revokeTrusted)!(true, [KEY])
    expect(t.saved()).toEqual([])
  })
})
