import { Schema } from "effect"
import { SIDECAR_STATUSES } from "./bridge"

/** IPC channel names. Main and preload both read them from here. */
export const CHANNELS = {
  connectionInfo: "tailshare:connection-info",
  chooseFolder: "tailshare:choose-folder",
  sidecarStatus: "tailshare:sidecar-status",
  getSettings: "tailshare:get-settings",
  updateSettings: "tailshare:update-settings",
  settingsChanged: "tailshare:settings-changed",
  getUpdateStatus: "tailshare:get-update-status",
  restartToUpdate: "tailshare:restart-to-update",
  updateStatus: "tailshare:update-status",
  windowMinimize: "tailshare:window-minimize",
  windowToggleMaximize: "tailshare:window-toggle-maximize",
  windowClose: "tailshare:window-close",
  getWindowState: "tailshare:get-window-state",
  windowState: "tailshare:window-state",
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
}

/** Validated preferences returned to the renderer. */
export const SettingsSchema = Schema.Struct(SETTINGS_FIELDS)

/** What the title bar needs to know about its window. */
export const WindowStateSchema = Schema.Struct({
  maximized: Schema.Boolean,
  mica: Schema.Boolean,
})

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
