import type { DownloadsStatus } from "../shared/bridge"

/** What {@link createDownloads} needs from main. */
export interface DownloadsDeps {
  /** Tells the sidecar the save folder. Rejects when it cannot be used. */
  configure(): Promise<unknown>
  /** Called every time the status changes. */
  onChange(status: DownloadsStatus): void
}

/**
 * Applies the save folder after the sidecar is up. A folder that cannot be used
 * turns downloads off, but never stops hosting, joining or chat: health no
 * longer waits on it. Calls run one at a time, newest folder last.
 */
export function createDownloads(deps: DownloadsDeps) {
  let status: DownloadsStatus = { ok: true }
  let queue: Promise<unknown> = Promise.resolve()

  return {
    /** The current status, for a page that loads late. */
    status: () => status,
    /** Runs the folder change. Never rejects; the result is the new status. */
    apply: (): Promise<DownloadsStatus> => {
      const run = queue
        .catch(() => {})
        .then(deps.configure)
        .then(
          () => ({ ok: true }),
          () => ({ ok: false })
        )
        .then((next) => {
          if (next.ok !== status.ok) {
            status = next
            deps.onChange(next)
          }

          return next
        })
      queue = run

      return run
    },
  }
}
