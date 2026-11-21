import { expect, it, vi } from "vitest"
import { createLimits } from "./limits"

it("sends the saved values each time it is called", async () => {
  let saved = { transfersAtOnce: 3, uploadLimitKiB: 0, downloadLimitKiB: 512 }
  const send = vi.fn(async () => ({}))
  const limits = createLimits({ settings: () => saved, send })

  await limits.apply()
  saved = { transfersAtOnce: 4, uploadLimitKiB: 100, downloadLimitKiB: 0 }
  await limits.apply()

  expect(send).toHaveBeenNthCalledWith(1, {
    transfersAtOnce: 3,
    uploadLimitKiB: 0,
    downloadLimitKiB: 512,
  })
  expect(send).toHaveBeenNthCalledWith(2, {
    transfersAtOnce: 4,
    uploadLimitKiB: 100,
    downloadLimitKiB: 0,
  })
})

it("never rejects when the sidecar refuses", async () => {
  const limits = createLimits({
    settings: () => ({
      transfersAtOnce: 2,
      uploadLimitKiB: 0,
      downloadLimitKiB: 0,
    }),
    send: async () => {
      throw new Error("down")
    },
  })

  await expect(limits.apply()).resolves.toBeUndefined()
})
