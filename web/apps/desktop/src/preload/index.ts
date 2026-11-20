import { contextBridge, ipcRenderer } from "electron"
import {
  SIDECAR_STATUSES,
  isUpdateStatus,
  type Settings,
  type SettingsPatch,
  type UpdateStatus,
  type SidecarStatus,
  type TailshareBridge,
} from "../shared/bridge"

// Channel names are repeated here on purpose: a sandboxed preload cannot load
// the schema module. src/preload/preload.test.ts checks they match.
const bridge: TailshareBridge = Object.freeze({
  getSettings: () => ipcRenderer.invoke("tailshare:get-settings"),
  updateSettings: (patch: SettingsPatch) =>
    ipcRenderer.invoke("tailshare:update-settings", patch),
  onSettingsChanged: (listener: (settings: Settings) => void) => {
    const handler = (_event: unknown, settings: unknown) => {
      // Main checks the value before sending; this only keeps junk out.
      if (settings && typeof settings === "object")
        listener(settings as Settings)
    }
    ipcRenderer.on("tailshare:settings-changed", handler)
    return () => void ipcRenderer.off("tailshare:settings-changed", handler)
  },
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
