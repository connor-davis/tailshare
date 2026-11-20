import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createUpdater, type UpdaterAdapter } from "./updater"

function setup(packaged = true) {
  const events = new EventEmitter()
  let channel = "latest"
  const adapter: UpdaterAdapter = {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    allowDowngrade: false,
    get channel() {
      return channel
    },
    set channel(value) {
      channel = value!
      this.allowDowngrade = true
    },
    checkForUpdates: vi.fn(async () => null),
    on: (event, listener) => events.on(event, listener),
    removeListener: (event, listener) => events.removeListener(event, listener),
    quitAndInstall: vi.fn(),
  }
  const shutdown = vi.fn(async () => {})
  const send = vi.fn()
  const controller = createUpdater({
    packaged,
    adapter,
    channel: "latest",
    shutdown,
    send,
  })
  return { adapter, controller, events, shutdown, send }
}

afterEach(() => vi.useRealTimers())
const settle = () =>
  new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)))

describe("updater", () => {
  it("does nothing in development", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup(false)
    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000)
    expect(adapter.checkForUpdates).not.toHaveBeenCalled()
    expect(events.eventNames()).toEqual([])
    expect(controller.status()).toEqual({ state: "disabled" })
    await expect(controller.restart()).rejects.toThrow("No update")
    controller.stop()
  })

  it("checks on start and every four hours, and stops cleanly", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup()
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(adapter.autoDownload).toBe(true)
    expect(adapter.autoInstallOnAppQuit).toBe(false)
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(2)
    controller.stop()
    expect(events.eventNames()).toEqual([])
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it("never overlaps checks or downloads and defers a channel switch", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup()
    await settle()
    let finish!: () => void
    const download = new Promise<void>((resolve) => {
      finish = resolve
    })
    vi.mocked(adapter.checkForUpdates).mockResolvedValue({
      downloadPromise: download,
    })
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
    controller.setChannel("nightly")
    events.emit("update-downloaded")
    expect(controller.status().state).toBe("checking")
    await expect(controller.restart()).rejects.toThrow("No update")
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(adapter.channel).toBe("latest")
    finish()
    await settle()
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(3)
    expect(adapter.channel).toBe("nightly")
    expect(adapter.allowPrerelease).toBe(true)
    expect(adapter.allowDowngrade).toBe(false)
    controller.stop()
  })

  it("returns to stable without allowing downgrade and checks again after a network error", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup()
    await settle()
    controller.setChannel("nightly")
    await settle()
    vi.mocked(adapter.checkForUpdates).mockRejectedValueOnce(
      new Error("offline")
    )
    controller.setChannel("latest")
    await settle()
    expect(adapter.channel).toBe("latest")
    expect(adapter.allowPrerelease).toBe(false)
    expect(adapter.allowDowngrade).toBe(false)
    expect(controller.status().state).toBe("error")
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
    events.emit("update-not-available")
    expect(controller.status().state).toBe("current")
    controller.stop()
  })

  it("normalizes events and waits for sidecar shutdown before installation", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events, shutdown } = setup()
    events.emit("download-progress", { percent: 120 })
    expect(controller.status()).toEqual({ state: "downloading", percent: 100 })
    events.emit("download-progress", { percent: NaN })
    expect(controller.status().percent).toBe(0)
    let finish!: () => void
    shutdown.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    events.emit("update-downloaded")
    const restart = controller.restart()
    expect(shutdown).toHaveBeenCalledOnce()
    expect(adapter.quitAndInstall).not.toHaveBeenCalled()
    await expect(controller.restart()).rejects.toThrow("No update")
    finish()
    await restart
    expect(adapter.quitAndInstall).toHaveBeenCalledOnce()
    controller.stop()
  })

  it("never installs when shutdown fails", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events, shutdown } = setup()
    shutdown.mockRejectedValueOnce(new Error("still running"))
    events.emit("update-downloaded")
    await expect(controller.restart()).rejects.toThrow("could not restart")
    expect(adapter.quitAndInstall).not.toHaveBeenCalled()
    controller.stop()
  })
})
