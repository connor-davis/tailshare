import { contextBridge, ipcRenderer } from "electron"
import {
  SIDECAR_STATUSES,
  isUpdateStatus,
  type UpdateChannel,
  type UpdateStatus,
  type SidecarStatus,
  type TailshareBridge,
} from "../shared/bridge"

// Channel names are repeated here on purpose: a sandboxed preload cannot load
// the schema module. src/preload/preload.test.ts checks they match.
const bridge: TailshareBridge = Object.freeze({
  getSettings: () => ipcRenderer.invoke("tailshare:get-settings"),
  setUpdateChannel: (channel: UpdateChannel) =>
    ipcRenderer.invoke("tailshare:set-update-channel", channel),
  getUpdateStatus: () => ipcRenderer.invoke("tailshare:get-update-status"),
  restartToUpdate: () => ipcRenderer.invoke("tailshare:restart-to-update"),
  onUpdateStatus: (listener: (status: UpdateStatus) => void) => {
    const handler = (_event: unknown, status: unknown) => {
      if (isUpdateStatus(status)) listener(status)
    }
    ipcRenderer.on("tailshare:update-status", handler)
    return () => void ipcRenderer.off("tailshare:update-status", handler)
  },
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
