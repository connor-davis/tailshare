// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { playScreen } from "./screen-player"

const mocks = vi.hoisted(() => ({ socket: vi.fn() }))
vi.mock("../api/screens", () => ({ screenSocket: mocks.socket }))

class Buffer extends EventTarget {
  updating = false
  timestampOffset = 0
  buffered = { length: 0, start: () => 0, end: () => 5 }
  abort = vi.fn()
  appendBuffer = vi.fn(() => {
    this.updating = true
  })
  remove = vi.fn()
}
class Media extends EventTarget {
  static isTypeSupported = () => true
  static last: Media
  buffer = new Buffer()
  constructor() {
    super()
    Media.last = this
  }
  addSourceBuffer = vi.fn(() => this.buffer)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("screen playback", () => {
  it("appends ordered chunks, offsets new epochs, follows live and closes on unmount", async () => {
    vi.stubGlobal("MediaSource", Media)
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:screen",
      revokeObjectURL: vi.fn(),
    })
    const socket = {
      close: vi.fn(),
      onmessage: undefined as
        undefined | ((event: { data: ArrayBuffer }) => void),
    }
    mocks.socket.mockResolvedValue(socket)
    const video = document.createElement("video")
    video.play = vi.fn(async () => {})
    video.pause = vi.fn()
    video.load = vi.fn()
    const error = vi.fn()
    const stop = playScreen(
      video,
      { id: "a", codec: "video/webm;codecs=vp8" },
      error
    )
    const media = Media.last
    media.dispatchEvent(new Event("sourceopen"))
    await Promise.resolve()
    socket.onmessage!({ data: new Uint8Array([1, 11, 22]).buffer })
    socket.onmessage!({ data: new Uint8Array([0, 33]).buffer })
    expect(media.buffer.appendBuffer).toHaveBeenCalledTimes(1)
    expect(media.buffer.appendBuffer).toHaveBeenLastCalledWith(
      new Uint8Array([11, 22])
    )
    media.buffer.updating = false
    media.buffer.dispatchEvent(new Event("updateend"))
    expect(media.buffer.appendBuffer).toHaveBeenLastCalledWith(
      new Uint8Array([33])
    )
    media.buffer.buffered.length = 1
    socket.onmessage!({ data: new Uint8Array([1, 44]).buffer })
    media.buffer.updating = false
    media.buffer.dispatchEvent(new Event("updateend"))
    expect(media.buffer.abort).toHaveBeenCalledOnce()
    expect(media.buffer.timestampOffset).toBe(5)
    expect(video.currentTime).toBe(4.7)
    stop()
    expect(socket.close).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:screen")
    expect(error).not.toHaveBeenCalled()
  })
  it("refuses an unbounded append backlog", async () => {
    vi.stubGlobal("MediaSource", Media)
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:screen",
      revokeObjectURL: vi.fn(),
    })
    const socket = {
      close: vi.fn(),
      onmessage: undefined as
        undefined | ((event: { data: ArrayBuffer }) => void),
    }
    mocks.socket.mockResolvedValue(socket)
    const video = document.createElement("video")
    video.play = vi.fn(async () => {})
    video.pause = vi.fn()
    video.load = vi.fn()
    const error = vi.fn()
    playScreen(video, { id: "a", codec: "video/webm;codecs=vp8" }, error)
    Media.last.dispatchEvent(new Event("sourceopen"))
    await Promise.resolve()
    for (let index = 0; index < 34; index++)
      socket.onmessage!({
        data: new Uint8Array([index === 0 ? 1 : 0, index]).buffer,
      })
    expect(error).toHaveBeenCalledOnce()
    expect(socket.close).toHaveBeenCalled()
  })
})
