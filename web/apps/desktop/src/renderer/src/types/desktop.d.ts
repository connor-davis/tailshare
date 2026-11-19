import type { TailshareBridge } from "../../../shared/bridge"

declare global {
  /** Only the preload's explicit surface is available to browser code. */
  interface Window {
    /** Connection details, the folder picker and sidecar status. */
    readonly tailshare: TailshareBridge
  }
}
