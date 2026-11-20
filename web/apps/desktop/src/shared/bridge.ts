/** Every state the sidecar can report to the window. */
export const SIDECAR_STATUSES = [
  "starting",
  "ready",
  "restarting",
  "failed",
] as const

/** One of the states in {@link SIDECAR_STATUSES}. */
export type SidecarStatus = (typeof SIDECAR_STATUSES)[number]

/** The two supported release feeds. */
export type UpdateChannel = "latest" | "nightly"

/** Persistent desktop preferences. Chat never belongs here. */
export interface Settings {
  readonly updateChannel: UpdateChannel
}

/** Safe update state sent to the renderer without upstream error details. */
export interface UpdateStatus {
  readonly state:
    "disabled" | "checking" | "current" | "downloading" | "ready" | "error"
  readonly percent?: number
}

/** Checks update events without loading Effect in the sandboxed preload. */
export function isUpdateStatus(value: unknown): value is UpdateStatus {
  if (!value || typeof value !== "object" || !("state" in value)) return false
  if (
    ![
      "disabled",
      "checking",
      "current",
      "downloading",
      "ready",
      "error",
    ].includes(String(value.state))
  )
    return false
  return (
    !("percent" in value) ||
    (typeof value.percent === "number" &&
      Number.isFinite(value.percent) &&
      value.percent >= 0 &&
      value.percent <= 100)
  )
}

/** Where the local API listens and the secret that opens it. */
export interface ConnectionInfo {
  /** Loopback origin such as `http://127.0.0.1:51234`, with no path. */
  readonly baseUrl: string
  /** Bearer token for HTTP calls, and the second WebSocket subprotocol. */
  readonly token: string
}

/**
 * The only thing browser code can reach in the desktop shell. Nothing here
 * exposes `ipcRenderer`, `process` or a way to call other channels.
 */
export interface TailshareBridge {
  /** Reads the saved update channel. */
  readonly getSettings: () => Promise<Settings>
  /** Persists the channel and schedules a check on that feed. */
  readonly setUpdateChannel: (channel: UpdateChannel) => Promise<Settings>
  /** Reads the current state, including events sent before the page loaded. */
  readonly getUpdateStatus: () => Promise<UpdateStatus>
  /** Stops the sidecar before installing a downloaded update. */
  readonly restartToUpdate: () => Promise<void>
  /** Subscribes to update state without polling. */
  readonly onUpdateStatus: (
    listener: (status: UpdateStatus) => void
  ) => () => void
  /**
   * Resolves once the sidecar passed its health check. Rejects with a plain
   * sentence if it is down for good.
   */
  readonly getConnectionInfo: () => Promise<ConnectionInfo>
  /** Opens the native folder picker. Resolves to `null` if cancelled. */
  readonly chooseFolder: () => Promise<string | null>
  /** Calls `listener` on each status change. Returns an unsubscribe. */
  readonly onSidecarStatus: (
    listener: (status: SidecarStatus) => void
  ) => () => void
}
