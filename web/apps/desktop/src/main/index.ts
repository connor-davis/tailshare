import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  type Tray,
} from "electron"
import { release } from "node:os"
import { join } from "node:path"
import { Effect, ManagedRuntime } from "effect"
import updaterPackage from "electron-updater"
import { CHANNELS } from "../shared/ipc-schema"
import { resolveSidecarPath } from "./config"
import { checkHealth } from "./health"
import {
  registerIpc,
  registerUpdateIpc,
  registerWindowIpc,
  type IpcHost,
} from "./ipc"
import {
  hideOnClose,
  quitWhenAllClosed,
  showWindow,
  startsHidden,
} from "./lifecycle"
import { applyLoginItem } from "./login-item"
import { openSettings } from "./settings"
import { createTray, trayIconPaths } from "./tray"
import { createUpdater } from "./updater"
import { Sidecar, sidecarLayer } from "./sidecar"
import { newToken, spawnSidecar } from "./sidecar-process"
import {
  applyLook,
  fixSocketOrigin,
  lockNavigation,
  toggleMaximize,
  windowMaterial,
  windowOptions,
  windowState,
  type WindowLook,
} from "./window"

let window: BrowserWindow | null = null
let quitting = false
// Set the moment a quit starts, so close-to-tray lets the window go.
let quitIntent = false
let closeToTray = false
let tray: Tray | null = null

function createWindow(hidden: boolean, look: WindowLook, onState: () => void) {
  window = new BrowserWindow({
    ...windowOptions(join(import.meta.dirname, "../preload/index.cjs"), look),
    show: !hidden,
  })
  lockNavigation(window.webContents)
  // The title bar swaps its maximise and restore button from these.
  window.on("maximize", () => onState())
  window.on("unmaximize", () => onState())
  hideOnClose(window, () => ({ closeToTray, quitting: quitIntent }))

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"))
  }
}

async function main() {
  await app.whenReady()
  app.setAppUserModelId("connor.davis.Tailshare")

  const binary = resolveSidecarPath({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: join(app.getAppPath(), "../../.."),
  })

  const runtime = ManagedRuntime.make(
    sidecarLayer({
      spawn: (token) => spawnSidecar(binary, token),
      newToken,
      health: (url, token) => checkHealth(url, token),
    })
  )
  const sidecar = await runtime.runPromise(
    Effect.gen(function* () {
      return yield* Sidecar
    })
  )

  const settings = openSettings(app.getPath("userData"), {
    downloads: app.getPath("downloads"),
  })
  closeToTray = settings.get().closeToTray
  const loginItem = (enabled: boolean) =>
    applyLoginItem(enabled, {
      packaged: app.isPackaged,
      execPath: process.execPath,
      host: app,
    })
  // Mica needs the setting on and Windows 11; otherwise a solid theme colour.
  const look = (mica = settings.get().mica): WindowLook => ({
    material: windowMaterial(mica, release()),
    dark: nativeTheme.shouldUseDarkColors,
  })
  const liveWindow = () => (window && !window.isDestroyed() ? window : null)
  const pushWindowState = (mica?: boolean) => {
    const open = liveWindow()
    open?.webContents.send(CHANNELS.windowState, windowState(open, look(mica)))
  }
  const refreshLook = (mica?: boolean) => {
    const open = liveWindow()
    if (open) applyLook(open, look(mica))
    pushWindowState(mica)
  }
  let shutdownPromise: Promise<void> | undefined
  const shutdown = () => {
    quitIntent = true
    updater.stop()
    shutdownPromise ??= runtime.dispose().then(() => {
      quitting = true
    })
    return shutdownPromise
  }
  const updater = createUpdater({
    packaged: app.isPackaged,
    adapter: updaterPackage.autoUpdater,
    channel: settings.get().updateChannel,
    send: (status) => {
      if (window && !window.isDestroyed())
        window.webContents.send(CHANNELS.updateStatus, status)
    },
    shutdown,
    log: (error) => console.warn("Tailshare update check:", error),
  })

  const host: IpcHost = {
    handle: (channel, handler) =>
      ipcMain.handle(channel, (event, ...args) =>
        handler(event.sender === window?.webContents, args)
      ),
    pickFolder: async () => {
      const options = { properties: ["openDirectory" as const] }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
  }
  await runtime.runPromise(registerIpc(host))
  registerUpdateIpc(host, settings, updater)
  registerWindowIpc(host, {
    minimize: () => liveWindow()?.minimize(),
    toggleMaximize: () => {
      const open = liveWindow()
      if (open) toggleMaximize(open)
    },
    // The close event runs the close-to-tray rule.
    close: () => liveWindow()?.close(),
    state: () => {
      const open = liveWindow()
      return open
        ? windowState(open, look())
        : { maximized: false, mica: false }
    },
  })

  // One place reacts to a saved change: updater, login item, tray flag, windows.
  settings.onChange((next, previous) => {
    closeToTray = next.closeToTray
    if (next.updateChannel !== previous.updateChannel)
      updater.setChannel(next.updateChannel)
    if (next.startWithWindows !== previous.startWithWindows)
      loginItem(next.startWithWindows)
    if (next.mica !== previous.mica) refreshLook(next.mica)
    for (const open of BrowserWindow.getAllWindows())
      open.webContents.send(CHANNELS.settingsChanged, next)
  })
  // The solid fallback follows the system theme.
  nativeTheme.on("updated", () => refreshLook())
  // Keeps the entry pointing at this build after an update moves it.
  loginItem(settings.get().startWithWindows)

  sidecar.onStatus((status) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send(CHANNELS.sidecarStatus, status)
    }
  })

  // Quit waits for the sidecar to stop (stdin closes, then a kill if needed).
  app.on("before-quit", (event) => {
    quitIntent = true
    if (quitting) return
    event.preventDefault()
    void shutdown()
      .then(() => app.quit())
      .catch((error: unknown) => {
        console.error("Tailshare could not stop:", error)
        app.exit(1)
      })
  })

  // The packaged page is file://, and its socket needs the Origin the sidecar knows.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["ws://127.0.0.1:*/*"] },
    (details, callback) =>
      callback({ requestHeaders: fixSocketOrigin(details.requestHeaders) })
  )

  createWindow(startsHidden(process.argv), look(), pushWindowState)

  tray = createTray(
    { onOpen: () => showWindow(window), onQuit: () => app.quit() },
    trayIconPaths({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    })
  )

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow(false, look(), pushWindowState)
  })
}

// Windows leaves a ghost icon behind if the tray is not removed.
app.on("will-quit", () => tray?.destroy())

app.on("window-all-closed", () => {
  if (quitWhenAllClosed({ platform: process.platform, closeToTray })) app.quit()
})

// One copy only: a second launch just brings the first window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => showWindow(window))

  main().catch((error: unknown) => {
    dialog.showErrorBox("Tailshare could not start", String(error))
    app.exit(1)
  })
}
