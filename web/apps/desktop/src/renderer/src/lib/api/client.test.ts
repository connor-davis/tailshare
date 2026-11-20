import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, apiFetch, resetConnection } from "./client"

const info = { baseUrl: "http://127.0.0.1:4000", token: "secret" }
const getConnectionInfo = vi.fn(() => Promise.resolve(info))

function answer(status: number, body: string) {
  return vi.fn(() => Promise.resolve(new Response(body, { status })))
}

beforeEach(() => {
  resetConnection()
  getConnectionInfo.mockClear()
  vi.stubGlobal("window", { tailshare: { getConnectionInfo } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("apiFetch", () => {
  it("sends the bearer token to the base url", async () => {
    const fetchMock = answer(200, '{"ok":true}')
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiFetch("/api/session")).resolves.toEqual({ ok: true })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe("http://127.0.0.1:4000/api/session")
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret" })
  })

  it("turns {code, message} into an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      answer(409, '{"code":"not_connected","message":"Join a room first."}')
    )

    const error = await apiFetch("/api/files/local").catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: "not_connected",
      message: "Join a room first.",
      status: 409,
    })
  })

  it("uses a generic sentence when the body is not JSON", async () => {
    vi.stubGlobal("fetch", answer(500, "panic: boom at main.go:1"))

    await expect(apiFetch("/api/session")).rejects.toThrow(
      "Something went wrong. Try again."
    )
  })

  it("says so when the sidecar does not answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fail")))
    )

    await expect(apiFetch("/api/session")).rejects.toThrow(
      "Tailshare is not responding."
    )
  })

  it("reads the connection again after a 401", async () => {
    vi.stubGlobal(
      "fetch",
      answer(401, '{"code":"unauthorized","message":"No."}')
    )

    await apiFetch("/api/session").catch(() => undefined)
    await apiFetch("/api/session").catch(() => undefined)

    expect(getConnectionInfo).toHaveBeenCalledTimes(2)
  })

  it("shares one connection call between requests", async () => {
    vi.stubGlobal("fetch", answer(200, "{}"))

    await apiFetch("/a")
    await apiFetch("/b")

    expect(getConnectionInfo).toHaveBeenCalledTimes(1)
  })
})
