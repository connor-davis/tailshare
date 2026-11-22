import type { Settings } from "../shared/bridge"

/** Serializes preference updates so the newest saved region reaches the sidecar last. */
export function createRelayRegion(deps: {
  settings(): Pick<Settings, "relayRegion">
  send(body: { relayRegion: Settings["relayRegion"] }): Promise<unknown>
}) {
  let queue: Promise<unknown> = Promise.resolve()

  return {
    /** Sends the current preference after ready or a saved change. */
    apply(): Promise<void> {
      const run = queue.then(async () => {
        try {
          await deps.send({ relayRegion: deps.settings().relayRegion })
        } catch {
          // A restart sends the saved preference again; it also starts in the spawn env.
        }
      })
      queue = run
      return run
    },
  }
}
