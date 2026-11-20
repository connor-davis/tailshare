import type { TailshareBridge } from "../../../shared/bridge"

declare global {
  /** Only the preload's explicit surface is available to browser code. */
  interface Window {
    /** Connection details, adding files, the folder pickers and sidecar status. */
    readonly tailshare: TailshareBridge
  }
}
