import type { TailshareBridge } from "../../../shared/bridge"

declare global {
  /** Only the preload's explicit surface is available to browser code. */
  interface Window {
    /** Desktop capabilities will be added after the local API exists. */
    readonly tailshare: TailshareBridge
  }
}
