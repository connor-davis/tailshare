import { describe, expect, it, vi } from "vitest"
import type {
  DesktopCapturerSource,
  DisplayMediaRequestHandlerHandlerRequest,
} from "electron"
import {
  createScreenCapture,
  registerScreenIpc,
  screenRequestAllowed,
} from "./screen-capture"
import { CHANNELS } from "../shared/ipc-schema"
import { isCaptureSources } from "../shared/bridge"

const source = (id: string) =>
  ({
    id,
    name: id,
    thumbnail: { toDataURL: () => "data:image/png;base64,AA==" },
  }) as DesktopCapturerSource

describe("capture consent", () => {
  it("grants only the picked opaque choice once, never a native ID", async () => {
    const first = source("screen:1")
    const second = source("window:2")
    const capture = createScreenCapture(async () => [first, second])
    expect(capture.grant(true)).toBeUndefined()
    const choices = await capture.sources()
    expect(isCaptureSources(choices)).toBe(true)
    expect(choices[0]!.id).not.toBe(first.id)
    expect(() => capture.pick(first.id)).toThrow()
    const refreshed = await capture.sources()
    capture.pick(refreshed[1]!.id)
    expect(capture.grant(true)).toBe(second)
    expect(capture.grant(true)).toBeUndefined()
  })
  it("expires choices and grants and refuses requests from another frame or for audio", async () => {
    let now = 0
    const capture = createScreenCapture(
      async () => [source("screen:1")],
      () => now
    )
    const choices = await capture.sources()
    now = 30_001
    expect(() => capture.pick(choices[0]!.id)).toThrow()
    const fresh = await capture.sources()
    capture.pick(fresh[0]!.id)
    now += 10_001
    expect(capture.grant(true)).toBeUndefined()
    const frame = {}
    const request = {
      frame,
      videoRequested: true,
      audioRequested: false,
    } as DisplayMediaRequestHandlerHandlerRequest
    expect(screenRequestAllowed(request, frame)).toBe(true)
    expect(screenRequestAllowed(request, {})).toBe(false)
    expect(
      screenRequestAllowed({ ...request, audioRequested: true }, frame)
    ).toBe(false)
    expect(
      screenRequestAllowed({ ...request, videoRequested: false }, frame)
    ).toBe(false)
  })
  it("sender-checks both typed channels and rejects extra arguments", async () => {
    const handlers = new Map<
      string,
      (ok: boolean, args: unknown[]) => Promise<unknown>
    >()
    const capture = createScreenCapture(async () => [source("screen:1")])
    registerScreenIpc(
      {
        handle: (name, handler) => {
          handlers.set(name, handler)
        },
        pickFolder: vi.fn(),
      },
      capture
    )
    const list = handlers.get(CHANNELS.screenSources)!
    const pick = handlers.get(CHANNELS.pickScreenSource)!
    await expect(list(false, [])).rejects.toThrow()
    await expect(list(true, ["extra"])).rejects.toThrow()
    const choices = (await list(true, [])) as { id: string }[]
    await expect(pick(false, [choices[0]!.id])).rejects.toThrow()
    expect(capture.grant(true)).toBeUndefined()
    await expect(pick(true, ["unknown"])).rejects.toThrow()
    await expect(pick(true, [choices[0]!.id, "extra"])).rejects.toThrow()
  })
  it("refuses a stale enumeration after reset or a newer picker", async () => {
    let resolve!: (sources: DesktopCapturerSource[]) => void
    const capture = createScreenCapture(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const pending = capture.sources()
    capture.reset()
    resolve([source("screen:1")])
    expect(await pending).toEqual([])
  })
})
