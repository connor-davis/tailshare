import { describe, expect, it, vi } from "vitest"
import { createDownloads } from "./downloads"

describe("createDownloads", () => {
  it("turns downloads off without throwing when the folder fails", async () => {
    const onChange = vi.fn()
    const downloads = createDownloads({
      configure: () => Promise.reject(new Error("drive gone")),
      onChange,
    })

    await expect(downloads.apply()).resolves.toEqual({ ok: false })

    expect(downloads.status()).toEqual({ ok: false })
    expect(onChange).toHaveBeenCalledWith({ ok: false })
  })

  it("turns them back on once a folder works, and tells only on change", async () => {
    const configure = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("no"))
      .mockResolvedValue({})
    const onChange = vi.fn()
    const downloads = createDownloads({ configure, onChange })

    await downloads.apply()
    await downloads.apply()
    await downloads.apply()

    expect(downloads.status()).toEqual({ ok: true })
    expect(onChange.mock.calls).toEqual([[{ ok: false }], [{ ok: true }]])
  })

  it("runs one change at a time", async () => {
    const order: string[] = []
    let release: () => void = () => {}
    const configure = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            order.push("first start")
            release = () => {
              order.push("first end")
              resolve()
            }
          })
      )
      .mockImplementation(async () => void order.push("second"))
    const downloads = createDownloads({ configure, onChange: () => {} })

    const first = downloads.apply()
    const second = downloads.apply()
    await vi.waitFor(() => expect(configure).toHaveBeenCalledTimes(1))
    release()
    await Promise.all([first, second])

    expect(order).toEqual(["first start", "first end", "second"])
  })
})
