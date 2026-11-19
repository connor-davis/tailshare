import { contextBridge, ipcRenderer } from "electron"
import {
  SIDECAR_STATUSES,
  type SidecarStatus,
  type TailshareBridge,
} from "../shared/bridge"

// Channel names are repeated here on purpose: a sandboxed preload cannot load
// the schema module. src/preload/preload.test.ts checks they match.
const bridge: TailshareBridge = Object.freeze({
  getConnectionInfo: () => ipcRenderer.invoke("tailshare:connection-info"),
  chooseFolder: () => ipcRenderer.invoke("tailshare:choose-folder"),
  onSidecarStatus: (listener: (status: SidecarStatus) => void) => {
    const handler = (_event: unknown, status: unknown) => {
      // Only known words reach the page, whatever main sends.
      if (SIDECAR_STATUSES.includes(status as SidecarStatus)) {
        listener(status as SidecarStatus)
      }
    }
    ipcRenderer.on("tailshare:sidecar-status", handler)
    return () => void ipcRenderer.off("tailshare:sidecar-status", handler)
  },
})

contextBridge.exposeInMainWorld("tailshare", bridge)
