import { Schema } from "effect"
import { SIDECAR_STATUSES } from "./bridge"

/** IPC channel names. Main and preload both read them from here. */
export const CHANNELS = {
  connectionInfo: "tailshare:connection-info",
  chooseFolder: "tailshare:choose-folder",
  sidecarStatus: "tailshare:sidecar-status",
  getSettings: "tailshare:get-settings",
  setUpdateChannel: "tailshare:set-update-channel",
  getUpdateStatus: "tailshare:get-update-status",
  restartToUpdate: "tailshare:restart-to-update",
  updateStatus: "tailshare:update-status",
} as const

/** Our own bridge methods take no arguments, so any extra one is refused. */
export const NoArgs = Schema.Tuple([])

/** The channel switch accepts exactly one known channel. */
export const UpdateChannelArgs = Schema.Tuple([
  Schema.Literals(["latest", "nightly"]),
])

/** Validated preferences returned to the renderer. */
export const SettingsSchema = Schema.Struct({
  updateChannel: Schema.Literals(["latest", "nightly"]),
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
