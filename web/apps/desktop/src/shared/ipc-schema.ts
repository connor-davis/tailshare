import { Schema } from "effect"
import { JOIN_CODE, SIDECAR_STATUSES } from "./bridge"

/** IPC channel names. Main and preload both read them from here. */
export const CHANNELS = {
  connectionInfo: "tailshare:connection-info",
  chooseFolder: "tailshare:choose-folder",
  addFiles: "tailshare:add-files",
  addDroppedFiles: "tailshare:add-dropped-files",
  openRoomFolder: "tailshare:open-room-folder",
  sidecarStatus: "tailshare:sidecar-status",
  getSettings: "tailshare:get-settings",
  updateSettings: "tailshare:update-settings",
  settingsChanged: "tailshare:settings-changed",
  getUpdateStatus: "tailshare:get-update-status",
  checkForUpdates: "tailshare:check-for-updates",
  openReleaseLink: "tailshare:open-release-link",
  openForwardLink: "tailshare:open-forward-link",
  downloadUpdate: "tailshare:download-update",
  restartToUpdate: "tailshare:restart-to-update",
  updateStatus: "tailshare:update-status",
  getWindowState: "tailshare:get-window-state",
  windowState: "tailshare:window-state",
  joinLink: "tailshare:join-link",
  rendererReady: "tailshare:renderer-ready",
  getRecentRooms: "tailshare:get-recent-rooms",
  touchRecentRoom: "tailshare:touch-recent-room",
  removeRecentRoom: "tailshare:remove-recent-room",
  recentRoomsChanged: "tailshare:recent-rooms-changed",
  getCurrentRoom: "tailshare:get-current-room",
  setCurrentRoom: "tailshare:set-current-room",
  getDownloadsStatus: "tailshare:get-downloads-status",
  downloadsStatus: "tailshare:downloads-status",
  startDownload: "tailshare:start-download",
} as const

/** Our own bridge methods take no arguments, so any extra one is refused. */
export const NoArgs = Schema.Tuple([])

/** An absolute Windows path: a drive letter or a network share. */
const AbsolutePath = Schema.String.check(
  Schema.isMaxLength(4096),
  Schema.isPattern(/^([A-Za-z]:[\\/]|\\\\[^\\/]+[\\/])/)
)

const KiB = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1048576 }))

/** Every setting and the rule it must meet. 0 for a limit means unlimited. */
export const SETTINGS_FIELDS = {
  updateChannel: Schema.Literals(["latest", "nightly"]),
  displayName: Schema.String.check(Schema.isBetweenLength(1, 64)),
  saveMode: Schema.Literals(["folder", "ask"]),
  saveFolder: AbsolutePath,
  uploadLimitKiB: KiB,
  downloadLimitKiB: KiB,
  transfersAtOnce: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 8 })
  ),
  startWithWindows: Schema.Boolean,
  closeToTray: Schema.Boolean,
  mica: Schema.Boolean,
  theme: Schema.Literals(["system", "light", "dark"]),
}

/** Validated preferences returned to the renderer. */
export const SettingsSchema = Schema.Struct(SETTINGS_FIELDS)

/** What the title bar needs to know about its window. */
export const WindowStateSchema = Schema.Struct({
  mica: Schema.Boolean,
})

/** A room code: 8 uppercase Crockford characters, no dash. */
export const JoinCodeSchema = Schema.String.check(Schema.isPattern(JOIN_CODE))

/** The open room, or `null` when none is. The name may be empty. */
export const CurrentRoomSchema = Schema.NullOr(
  Schema.Struct({
    name: Schema.String.check(Schema.isMaxLength(64)),
    code: JoinCodeSchema,
  })
)

/** Whether downloads have a working folder. */
export const DownloadsStatusSchema = Schema.Struct({ ok: Schema.Boolean })

/** One saved room. The name is 1 to 64 characters, the time is in ms. */
export const RecentRoomSchema = Schema.Struct({
  name: Schema.String.check(Schema.isBetweenLength(1, 64)),
  code: JoinCodeSchema,
  lastSeen: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

/** The reply to `getRecentRooms`, newest first. */
export const RecentRoomsSchema = Schema.Array(RecentRoomSchema)

/** A loopback origin with a port, the only kind the sidecar may report. */
export const LoopbackOrigin = Schema.String.check(
  Schema.isPattern(/^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/)
)

/** The reply to `getConnectionInfo`. The token is 64 lowercase hex chars. */
export const ConnectionInfoSchema = Schema.Struct({
  baseUrl: LoopbackOrigin,
  token: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
})

/** A status pushed from main to the window. */
export const SidecarStatusSchema = Schema.Literals(SIDECAR_STATUSES)

/** A picked folder, or `null` for a cancelled dialog. Paths stay under 4096. */
export const ChosenFolderSchema = Schema.NullOr(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096))
)

/** A file in the room to save, and the name to offer in the Save dialog. */
export const StartDownloadSchema = Schema.Struct({
  source: Schema.String.check(Schema.isBetweenLength(1, 4096)),
  name: Schema.String.check(
    Schema.isBetweenLength(1, 255),
    Schema.isPattern(/^[^\\/]+$/)
  ),
})

/** Paths resolved by preload or the native picker, capped to one batch. */
export const AddedPathsSchema = Schema.Array(AbsolutePath).check(
  Schema.isMaxLength(100)
)

/** Main checks the sidecar reply before returning it to the page. */
export const AddFilesResultSchema = Schema.Struct({
  added: Schema.Array(
    Schema.Struct({ name: Schema.String, size: Schema.Number })
  ),
  skipped: Schema.Array(
    Schema.Struct({ name: Schema.String, reason: Schema.String })
  ),
})
