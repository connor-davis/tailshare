import type { UpdateChannel, UpdateStatus } from "../shared/bridge"

/** The electron-updater surface, kept injectable for offline tests. */
export interface UpdaterAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  channel: string | null
  checkForUpdates(): Promise<{
    downloadPromise?: Promise<unknown> | null
  } | null>
  on(event: string, listener: (...args: unknown[]) => void): unknown
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown
  quitAndInstall(): void
}

/** Starts one packaged updater; development never touches the network or timers. */
export function createUpdater(options: {
  packaged: boolean
  adapter: UpdaterAdapter
  channel: UpdateChannel
  send: (status: UpdateStatus) => void
  shutdown: () => Promise<void>
  every?: (callback: () => void, milliseconds: number) => () => void
  log?: (error: unknown) => void
}) {
  const adapter = options.adapter
  let status: UpdateStatus = { state: "disabled" }
  let desired = options.channel
  let configured = desired
  let active = false
  let stopped = false
  let installing = false
  let recheck = false
  const listeners = new Map<string, (...args: unknown[]) => void>()
  let cancelTimer = () => {}

  function report(next: UpdateStatus) {
    if (stopped || desired !== configured) return
    status = next
    options.send({ ...status })
  }

  function configure() {
    configured = desired
    adapter.channel = configured
    adapter.allowPrerelease = configured === "nightly"
    // Setting channel enables downgrades upstream, so reset this afterwards.
    adapter.allowDowngrade = false
  }

  async function check() {
    if (!options.packaged || stopped || active || installing) return
    active = true
    configure()
    report({ state: "checking" })

    try {
      const result = await adapter.checkForUpdates()
      // Keep the feed fixed until its download completes, too.
      await result?.downloadPromise
    } catch (error) {
      options.log?.(error)
      report({ state: "error" })
    } finally {
      active = false
      if (recheck && !stopped) {
        recheck = false
        void check()
      }
    }
  }

  function listen(event: string, listener: (...args: unknown[]) => void) {
    listeners.set(event, listener)
    adapter.on(event, listener)
  }

  function stop() {
    stopped = true
    cancelTimer()
    for (const [event, listener] of listeners)
      adapter.removeListener(event, listener)
    listeners.clear()
  }

  if (options.packaged) {
    adapter.autoDownload = true
    // Installation always passes through the sidecar shutdown below.
    adapter.autoInstallOnAppQuit = false
    listen("update-not-available", () => report({ state: "current" }))
    listen("update-available", () =>
      report({ state: "downloading", percent: 0 })
    )
    listen("download-progress", (value) => {
      const percent =
        value && typeof value === "object" && "percent" in value
          ? value.percent
          : 0
      report({
        state: "downloading",
        percent:
          typeof percent === "number" && Number.isFinite(percent)
            ? Math.max(0, Math.min(100, percent))
            : 0,
      })
    })
    listen("update-downloaded", () => report({ state: "ready" }))
    listen("error", (error) => {
      options.log?.(error)
      report({ state: "error" })
    })

    const every =
      options.every ??
      ((callback, milliseconds) => {
        const timer = setInterval(callback, milliseconds)
        return () => clearInterval(timer)
      })
    cancelTimer = every(() => void check(), 4 * 60 * 60 * 1000)
    void check()
  }

  return {
    status: (): UpdateStatus => ({ ...status }),
    setChannel(channel: UpdateChannel) {
      desired = channel
      status = { state: options.packaged ? "checking" : "disabled" }
      options.send({ ...status })
      if (active) recheck = true
      else void check()
    },
    async restart() {
      if (
        !options.packaged ||
        stopped ||
        installing ||
        status.state !== "ready" ||
        desired !== configured
      ) {
        throw new Error("No update is ready. Wait for the download to finish.")
      }
      installing = true
      cancelTimer()

      try {
        await options.shutdown()
        adapter.quitAndInstall()
      } catch (error) {
        installing = false
        options.log?.(error)
        throw new Error("Tailshare could not restart to update. Try again.", {
          cause: error,
        })
      }
    },
    stop,
  }
}

/** The updater operations exposed to the guarded IPC boundary. */
export type UpdateController = ReturnType<typeof createUpdater>
