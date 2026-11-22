import { describe, expect, it, vi } from "vitest"
import { createRelayRegion } from "./relay-region"
import type { Settings } from "../shared/bridge"

describe("relay preference", () => {
  it("sends the newest saved preference last and retries after a failure", async () => {
    let region: Settings["relayRegion"] = "303"
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("restart"))
      .mockResolvedValue(undefined)
    const relay = createRelayRegion({
      settings: () => ({ relayRegion: region }),
      send,
    })
    await relay.apply()
    region = "nearest"
    await relay.apply()
    expect(send.mock.calls.map(([body]) => body)).toEqual([
      { relayRegion: "303" },
      { relayRegion: "nearest" },
    ])
  })
})
