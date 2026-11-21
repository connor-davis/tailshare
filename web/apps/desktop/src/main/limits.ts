import type { Settings } from "../shared/bridge"

/** What {@link createLimits} needs from main. */
export interface LimitsDeps {
  /** The saved settings, read fresh on every apply. */
  settings(): Pick<
    Settings,
    "transfersAtOnce" | "uploadLimitKiB" | "downloadLimitKiB"
  >
  /** Sends the body to the sidecar. */
  send(body: {
    transfersAtOnce: number
    uploadLimitKiB: number
    downloadLimitKiB: number
  }): Promise<unknown>
}

/**
 * Gives the sidecar the Settings screen's transfer count and speed caps. Call
 * `apply` when the sidecar is ready and when one of the three changes. A
 * failure is dropped: the next start or change sends the values again.
 */
export function createLimits(deps: LimitsDeps) {
  let queue: Promise<unknown> = Promise.resolve()

  return {
    /** Sends the saved values, one call at a time, newest last. */
    apply: (): Promise<void> => {
      const run = queue.then(() => {
        const { transfersAtOnce, uploadLimitKiB, downloadLimitKiB } =
          deps.settings()

        return deps
          .send({ transfersAtOnce, uploadLimitKiB, downloadLimitKiB })
          .then(
            () => undefined,
            () => undefined
          )
      })
      queue = run

      return run
    },
  }
}
