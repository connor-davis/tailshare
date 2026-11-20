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
  /** Shown to the other side. 1 to 64 characters. */
  readonly displayName: string
  /** `folder` saves into {@link Settings.saveFolder}; `ask` asks each time. */
  readonly saveMode: "folder" | "ask"
  /** Absolute path where downloads land. */
  readonly saveFolder: string
  /** KiB per second. 0 means unlimited. */
  readonly uploadLimitKiB: number
  /** KiB per second. 0 means unlimited. */
  readonly downloadLimitKiB: number
  /** How many transfers run together, 1 to 8. */
  readonly transfersAtOnce: number
  /** Launch hidden in the tray when Windows signs in. */
  readonly startWithWindows: boolean
  /** Closing the window hides it instead of quitting. */
  readonly closeToTray: boolean
  /** Windows 11 Mica background. */
  readonly mica: boolean
}

/** Any subset of {@link Settings}. A patch is applied whole or not at all. */
export type SettingsPatch = Partial<Settings>

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

/** What the window reports to the title bar. */
export interface WindowState {
  /** The window fills the screen, so the page leaves room for the overhang. */
  readonly maximized: boolean
  /** Windows 11 Mica is really on. False on Windows 10 or when it is off. */
  readonly mica: boolean
}

/** Checks window events without loading Effect in the sandboxed preload. */
export function isWindowState(value: unknown): value is WindowState {
  return (
    !!value &&
    typeof value === "object" &&
    "maximized" in value &&
    "mica" in value &&
    typeof value.maximized === "boolean" &&
    typeof value.mica === "boolean"
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
  /** Reads the saved settings. */
  readonly getSettings: () => Promise<Settings>
  /** Checks and saves a patch, then resolves to the new settings. */
  readonly updateSettings: (patch: SettingsPatch) => Promise<Settings>
  /** Calls `listener` after every saved change. Returns an unsubscribe. */
  readonly onSettingsChanged: (
    listener: (settings: Settings) => void
  ) => () => void
  /** Reads the current state, including events sent before the page loaded. */
  readonly getUpdateStatus: () => Promise<UpdateStatus>
  /** Stops the sidecar before installing a downloaded update. */
  readonly restartToUpdate: () => Promise<void>
  /** Subscribes to update state without polling. */
  readonly onUpdateStatus: (
    listener: (status: UpdateStatus) => void
  ) => () => void
  /** Minimises the window. */
  readonly minimizeWindow: () => Promise<void>
  /** Maximises the window, or restores it if it already fills the screen. */
  readonly toggleMaximizeWindow: () => Promise<void>
  /** Closes the window. Close to tray may hide it instead of quitting. */
  readonly closeWindow: () => Promise<void>
  /** Reads the window state, including changes sent before the page loaded. */
  readonly getWindowState: () => Promise<WindowState>
  /** Calls `listener` on each maximise, restore and Mica change. */
  readonly onWindowState: (listener: (state: WindowState) => void) => () => void
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
