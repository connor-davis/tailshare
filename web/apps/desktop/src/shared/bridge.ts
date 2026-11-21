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
  /** `folder` saves into {@link Settings.saveFolder}; `ask` currently also uses that folder. */
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
  /** `system` follows Windows; `light` and `dark` force the look. */
  readonly theme: "system" | "light" | "dark"
}

/** Any subset of {@link Settings}. A patch is applied whole or not at all. */
export type SettingsPatch = Partial<Settings>

/** Safe update state sent to the renderer without upstream error details. */
export interface UpdateStatus {
  readonly state:
    | "disabled"
    | "checking"
    | "current"
    | "available"
    | "downloading"
    | "ready"
    | "error"
  readonly version?: string
  readonly notes?: string
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
      "available",
      "downloading",
      "ready",
      "error",
    ].includes(String(value.state))
  )
    return false
  if (
    value.state === "available" &&
    (!("version" in value) ||
      typeof value.version !== "string" ||
      !("notes" in value) ||
      typeof value.notes !== "string" ||
      value.notes.length > 20_000)
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
  /** Windows 11 Mica is really on. False on Windows 10 or when it is off. */
  readonly mica: boolean
}

/** Checks window events without loading Effect in the sandboxed preload. */
export function isWindowState(value: unknown): value is WindowState {
  return (
    !!value &&
    typeof value === "object" &&
    "mica" in value &&
    typeof value.mica === "boolean"
  )
}

/** A room code as the bridge carries it: 8 uppercase Crockford characters. */
export const JOIN_CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/

/** Checks a room code without loading Effect in the sandboxed preload. */
export function isJoinCode(value: unknown): value is string {
  return typeof value === "string" && JOIN_CODE.test(value)
}

/** A room kept for the recent list. Never holds chat, members or paths. */
export interface RecentRoom {
  /** The room's own name, 1 to 64 characters. */
  readonly name: string
  /** The bare code, such as `7K3Q9PXM`. A secret: it joins the room. */
  readonly code: string
  /** When the room was last joined or left, in ms since 1970. */
  readonly lastSeen: number
}

/** Checks a recent-room list without loading Effect in the sandboxed preload. */
export function isRecentRooms(value: unknown): value is RecentRoom[] {
  return (
    Array.isArray(value) &&
    value.every(
      (room) =>
        !!room &&
        typeof room === "object" &&
        typeof room.name === "string" &&
        isJoinCode(room.code) &&
        typeof room.lastSeen === "number"
    )
  )
}

/** The room this window is in, kept by main so a reloaded page can find it. */
export interface CurrentRoom {
  /** The room's own name; empty when the sidecar gave none. Up to 64 characters. */
  readonly name: string
  /** The bare code. A secret: it joins the room. */
  readonly code: string
}

/** Checks a current room without loading Effect in the sandboxed preload. */
export function isCurrentRoom(value: unknown): value is CurrentRoom {
  return (
    !!value &&
    typeof value === "object" &&
    "name" in value &&
    typeof value.name === "string" &&
    "code" in value &&
    isJoinCode(value.code)
  )
}

/** Whether received files have a folder to land in. */
export interface DownloadsStatus {
  /** False when the save folder could not be used; downloads stay off. */
  readonly ok: boolean
}

/** Checks a downloads status without loading Effect in the sandboxed preload. */
export function isDownloadsStatus(value: unknown): value is DownloadsStatus {
  return (
    !!value &&
    typeof value === "object" &&
    "ok" in value &&
    typeof value.ok === "boolean"
  )
}

/** Where the local API listens and the secret that opens it. */
export interface ConnectionInfo {
  /** Loopback origin such as `http://127.0.0.1:51234`, with no path. */
  readonly baseUrl: string
  /** Bearer token for HTTP calls, and the second WebSocket subprotocol. */
  readonly token: string
}

/** The result of copying consented files into a room. */
export interface AddFilesResult {
  readonly added: { name: string; size: number }[]
  readonly skipped: { name: string; reason: string }[]
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
  /** Checks for an update now. Does nothing while a check runs or an update is ready. */
  readonly checkForUpdates: () => Promise<void>
  /** Opens an HTTPS github.com release link in the system browser. */
  readonly openReleaseLink: (url: string) => Promise<void>
  /** Opens `http://127.0.0.1:<port>/` for a forwarded app in the system browser. */
  readonly openForwardLink: (url: string) => Promise<void>
  /** Downloads an available release only after the user asks. */
  readonly downloadUpdate: () => Promise<void>
  /** Stops the sidecar before installing a downloaded update. */
  readonly restartToUpdate: () => Promise<void>
  /** Subscribes to update state without polling. */
  readonly onUpdateStatus: (
    listener: (status: UpdateStatus) => void
  ) => () => void
  /** Reads the window state, including changes sent before the page loaded. */
  readonly getWindowState: () => Promise<WindowState>
  /** Calls `listener` on each Mica change. */
  readonly onWindowState: (listener: (state: WindowState) => void) => () => void
  /**
   * Calls `listener` with the bare code from each `tailshare://join/<CODE>`
   * link. Subscribing also tells main the page is ready, so a link that came
   * in before this call is delivered now. Returns an unsubscribe.
   */
  readonly onJoinLink: (listener: (code: string) => void) => () => void
  /** Reads the recent rooms, newest first. */
  readonly getRecentRooms: () => Promise<RecentRoom[]>
  /** Saves or refreshes a room on join and leave. */
  readonly touchRecentRoom: (room: {
    name: string
    code: string
  }) => Promise<void>
  /** Forgets one room by its bare code. */
  readonly removeRecentRoom: (code: string) => Promise<void>
  /** Calls `listener` with the whole list after each change. */
  readonly onRecentRoomsChanged: (
    listener: (rooms: RecentRoom[]) => void
  ) => () => void
  /** Reads the room kept by main, or `null`. Survives a page reload. */
  readonly getCurrentRoom: () => Promise<CurrentRoom | null>
  /** Tells main which room is open, or `null` once it is over. */
  readonly setCurrentRoom: (room: CurrentRoom | null) => Promise<void>
  /** Reads whether the save folder works, including news sent before load. */
  readonly getDownloadsStatus: () => Promise<DownloadsStatus>
  /** Calls `listener` when the save folder starts or stops working. */
  readonly onDownloadsStatus: (
    listener: (status: DownloadsStatus) => void
  ) => () => void
  /**
   * Resolves once the sidecar passed its health check. Rejects with a plain
   * sentence if it is down for good.
   */
  readonly getConnectionInfo: () => Promise<ConnectionInfo>
  /** Opens the native folder picker. Resolves to `null` if cancelled. */
  readonly chooseFolder: () => Promise<string | null>
  /** Opens a native multi-file picker and copies selected files into the room. */
  readonly addFiles: () => Promise<AddFilesResult | null>
  /** Resolves real dropped Files in preload; paths never enter renderer code. */
  readonly addDroppedFiles: (files: File[]) => Promise<AddFilesResult>
  /** Opens the persistent folder for a validated room code. */
  readonly openRoomFolder: (code: string) => Promise<void>
  /** Calls `listener` on each status change. Returns an unsubscribe. */
  readonly onSidecarStatus: (
    listener: (status: SidecarStatus) => void
  ) => () => void
}

/** Allows only `http://127.0.0.1:<port>/` with a port from 1024 up: a forwarded app. */
export function isForwardLink(value: unknown): value is string {
  if (typeof value !== "string") return false

  const match = /^http:\/\/127\.0\.0\.1:([0-9]{1,5})\/$/.exec(value)
  if (!match) return false

  const port = Number(match[1])
  return port >= 1024 && port <= 65535
}

/** Allows only explicit HTTPS GitHub URLs without credentials or a custom port. */
export function isReleaseLink(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^https:\/\//i.test(value) ||
    /[\s\\]/.test(value)
  )
    return false

  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.host === "github.com" &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
