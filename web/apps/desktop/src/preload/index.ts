import { contextBridge, ipcRenderer, webUtils } from "electron"
import {
  SIDECAR_STATUSES,
  isDownloadsStatus,
  isJoinCode,
  isRecentRooms,
  isUpdateStatus,
  isWindowState,
  type CurrentRoom,
  type DownloadsStatus,
  type NotifyKind,
  type RecentRoom,
  type Settings,
  type SettingsPatch,
  type UpdateStatus,
  type WindowState,
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
  checkForUpdates: () => ipcRenderer.invoke("tailshare:check-for-updates"),
  openReleaseLink: (url: string) =>
    ipcRenderer.invoke("tailshare:open-release-link", url),
  openForwardLink: (url: string) =>
    ipcRenderer.invoke("tailshare:open-forward-link", url),
  downloadUpdate: () => ipcRenderer.invoke("tailshare:download-update"),
  restartToUpdate: () => ipcRenderer.invoke("tailshare:restart-to-update"),
  onUpdateStatus: (listener: (status: UpdateStatus) => void) => {
    const handler = (_event: unknown, status: unknown) => {
      if (isUpdateStatus(status)) listener(status)
    }
    ipcRenderer.on("tailshare:update-status", handler)
    return () => void ipcRenderer.off("tailshare:update-status", handler)
  },
  getWindowState: () => ipcRenderer.invoke("tailshare:get-window-state"),
  onWindowState: (listener: (state: WindowState) => void) => {
    const handler = (_event: unknown, state: unknown) => {
      if (isWindowState(state)) listener(state)
    }
    ipcRenderer.on("tailshare:window-state", handler)
    return () => void ipcRenderer.off("tailshare:window-state", handler)
  },
  onJoinLink: (listener: (code: string) => void) => {
    const handler = (_event: unknown, code: unknown) => {
      if (isJoinCode(code)) listener(code)
    }
    ipcRenderer.on("tailshare:join-link", handler)
    // The listener exists now, so main may send any link it was holding.
    ipcRenderer.send("tailshare:renderer-ready")
    return () => void ipcRenderer.off("tailshare:join-link", handler)
  },
  getRecentRooms: () => ipcRenderer.invoke("tailshare:get-recent-rooms"),
  touchRecentRoom: (room: { name: string; code: string }) =>
    ipcRenderer.invoke("tailshare:touch-recent-room", room),
  removeRecentRoom: (code: string) =>
    ipcRenderer.invoke("tailshare:remove-recent-room", code),
  onRecentRoomsChanged: (listener: (rooms: RecentRoom[]) => void) => {
    const handler = (_event: unknown, rooms: unknown) => {
      if (isRecentRooms(rooms)) listener(rooms)
    }
    ipcRenderer.on("tailshare:recent-rooms-changed", handler)
    return () => void ipcRenderer.off("tailshare:recent-rooms-changed", handler)
  },
  getCurrentRoom: () => ipcRenderer.invoke("tailshare:get-current-room"),
  setCurrentRoom: (room: CurrentRoom | null) =>
    ipcRenderer.invoke("tailshare:set-current-room", room),
  getDownloadsStatus: () =>
    ipcRenderer.invoke("tailshare:get-downloads-status"),
  onDownloadsStatus: (listener: (status: DownloadsStatus) => void) => {
    const handler = (_event: unknown, status: unknown) => {
      if (isDownloadsStatus(status)) listener(status)
    }
    ipcRenderer.on("tailshare:downloads-status", handler)
    return () => void ipcRenderer.off("tailshare:downloads-status", handler)
  },
  getConnectionInfo: () => ipcRenderer.invoke("tailshare:connection-info"),
  chooseFolder: () => ipcRenderer.invoke("tailshare:choose-folder"),
  addFiles: () => ipcRenderer.invoke("tailshare:add-files"),
  addFolder: () => ipcRenderer.invoke("tailshare:add-folder"),
  addDroppedFiles: (files: File[]) => {
    const paths = files.flatMap((file) => {
      try {
        const path = webUtils.getPathForFile(file)
        return path ? [path] : []
      } catch {
        return []
      }
    })
    return ipcRenderer.invoke("tailshare:add-dropped-files", paths)
  },
  startDownload: (request: {
    source: string
    name: string
    folder?: boolean
  }) => ipcRenderer.invoke("tailshare:start-download", request),
  notify: (request: { kind: NotifyKind; name: string }) =>
    ipcRenderer.invoke("tailshare:notify", request),
  pasteFromClipboard: () => ipcRenderer.invoke("tailshare:paste-clipboard"),
  setRoomFolder: (room: { code: string; folder: string | null }) =>
    ipcRenderer.invoke("tailshare:set-room-folder", room),
  canDragFile: (transferId: string) =>
    ipcRenderer.invoke("tailshare:can-drag-file", transferId),
  startFileDrag: (transferId: string) =>
    ipcRenderer.invoke("tailshare:start-file-drag", transferId),
  revealDownload: (transferId: string) =>
    ipcRenderer.invoke("tailshare:reveal-download", transferId),
  previewDownload: (transferId: string) =>
    ipcRenderer.invoke("tailshare:preview-download", transferId),
  trustJoin: (pendingId: number) =>
    ipcRenderer.invoke("tailshare:trust-join", pendingId),
  revokeTrusted: (key: string) =>
    ipcRenderer.invoke("tailshare:revoke-trusted", key),
  openRoomFolder: (code: string) =>
    ipcRenderer.invoke("tailshare:open-room-folder", code),
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
