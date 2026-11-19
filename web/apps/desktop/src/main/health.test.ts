import { describe, expect, it } from "vitest"
import { checkHealth, type FetchLike } from "./health"

const reply =
  (status: number, body: unknown): FetchLike =>
  async () => ({ status, json: async () => body })

describe("checkHealth", () => {
  it("passes for a 200 with status ok", async () => {
    await expect(
      checkHealth(
        "http://127.0.0.1:1",
        "tok",
        reply(200, { status: "ok", version: "1" })
      )
    ).resolves.toBeUndefined()
  })

  it("sends the bearer token to /api/health", async () => {
    let seen: { url: string; auth: string | undefined } | undefined
    await checkHealth("http://127.0.0.1:9", "secret", async (url, init) => {
      seen = { url, auth: init.headers.Authorization }
      return { status: 200, json: async () => ({ status: "ok" }) }
    })

    expect(seen).toEqual({
      url: "http://127.0.0.1:9/api/health",
      auth: "Bearer secret",
    })
  })

  it("rejects a non-200 reply", async () => {
    await expect(
      checkHealth("http://127.0.0.1:1", "tok", reply(401, {}))
    ).rejects.toThrow("answered 401")
  })

  it("rejects a body that is not status ok", async () => {
    await expect(
      checkHealth(
        "http://127.0.0.1:1",
        "tok",
        reply(200, { status: "starting" })
      )
    ).rejects.toThrow()
    await expect(
      checkHealth("http://127.0.0.1:1", "tok", reply(200, null))
    ).rejects.toThrow()
  })

  it("rejects when the request itself fails", async () => {
    await expect(
      checkHealth("http://127.0.0.1:1", "tok", async () => {
        throw new Error("refused")
      })
    ).rejects.toThrow("refused")
  })
})
