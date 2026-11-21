// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createScreenRecorder, screenCodec } from "./screen-recorder"

const mocks = vi.hoisted(() => ({ api: vi.fn(), socket: vi.fn() }))
vi.mock("../api/client", () => ({ apiFetch: mocks.api }))
vi.mock("../api/screens", () => ({ screenSocket: mocks.socket }))

class Recorder {
  static isTypeSupported = vi.fn((codec: string) => codec.includes("vp8"))
  state = "inactive"
  ondataavailable?: (event: { data: Blob }) => void
  onstop?: () => void
  onerror?: () => void
  constructor(
    _stream: unknown,
    readonly options: MediaRecorderOptions
  ) {
    instances.push(this)
  }
  start = vi.fn(() => {
    this.state = "recording"
  })
  stop = vi.fn(() => {
    this.state = "inactive"
    this.onstop?.()
  })
}
let instances: Recorder[] = []
const track = {
  stop: vi.fn(),
  applyConstraints: vi.fn(async () => {}),
  addEventListener: vi.fn(),
}
const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
const socket = {
  readyState: 1,
  bufferedAmount: 0,
  send: vi.fn(),
  close: vi.fn(),
  onclose: null,
  onerror: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  instances = []
  vi.stubGlobal("MediaRecorder", Recorder)
  vi.stubGlobal("MediaSource", { isTypeSupported: () => true })
  vi.stubGlobal("tailshare", { pickScreenSource: vi.fn(async () => {}) })
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getDisplayMedia: vi.fn(async () => stream) },
  })
  mocks.api.mockResolvedValue({ id: "share" })
  mocks.socket.mockResolvedValue(socket)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("screen recorder", () => {
  it("uses supported VP8, bounded settings, epochs and cleans up on Stop", async () => {
    vi.useFakeTimers()
    const error = vi.fn()
    const capture = createScreenRecorder(error)
    await capture.start("opaque")
    expect(screenCodec()).toBe("video/webm;codecs=vp8")
    expect(track.applyConstraints).toHaveBeenCalledWith({
      width: { max: 1920 },
      height: { max: 1080 },
      frameRate: { max: 15 },
    })
    expect(instances[0]!.options.videoBitsPerSecond).toBe(2_500_000)
    expect(instances[0]!.start).toHaveBeenCalledWith(250)
    const bytes = new Uint8Array([11, 22])
    instances[0]!.ondataavailable?.({
      data: { size: 2, arrayBuffer: async () => bytes.buffer } as Blob,
    })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(socket.send).toHaveBeenCalledWith(new Uint8Array([1, 11, 22]))
    expect(instances).toHaveLength(2)
    capture.stop()
    expect(track.stop).toHaveBeenCalled()
    expect(socket.close).toHaveBeenCalled()
    expect(mocks.api).toHaveBeenCalledWith("/api/screen/share", {
      method: "DELETE",
    })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(instances).toHaveLength(2)
    expect(error).not.toHaveBeenCalled()
  })
  it("stops on track end and cancels pending capture after leave", async () => {
    const capture = createScreenRecorder(vi.fn())
    await capture.start("opaque")
    const ended = track.addEventListener.mock.calls[0]![1] as () => void
    ended()
    expect(track.stop).toHaveBeenCalled()
    let resolve!: (value: MediaStream) => void
    vi.mocked(navigator.mediaDevices.getDisplayMedia).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }) as Promise<MediaStream>
    )
    const starting = capture.start("opaque")
    await Promise.resolve()
    await Promise.resolve()
    capture.stop()
    resolve(stream as unknown as MediaStream)
    await starting
    expect(track.stop).toHaveBeenCalledTimes(2)
  })
  it("disconnects on bounded local socket backpressure", async () => {
    const error = vi.fn()
    const capture = createScreenRecorder(error)
    await capture.start("opaque")
    socket.bufferedAmount = 4_194_304
    instances[0]!.ondataavailable?.({
      data: {
        size: 2,
        arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
      } as Blob,
    })
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    socket.bufferedAmount = 0
  })
})
