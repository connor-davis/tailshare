import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  session,
  shell,
  type Tray,
} from "electron"
import { release } from "node:os"
import { join, resolve } from "node:path"
import { Effect, ManagedRuntime } from "effect"
import updaterPackage from "electron-updater"
import { CHANNELS } from "../shared/ipc-schema"
import { resolveSidecarPath } from "./config"
import { checkHealth } from "./health"
import {
  registerIpc,
  registerRecentRoomsIpc,
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
import { createJoinInbox, findJoinLink } from "./join-link"
import { applyLoginItem } from "./login-item"
import { openRecentRooms } from "./recent-rooms"
import { callMainApi, registerRoomIpc } from "./room-ipc"
import type { AddFilesResult, ConnectionInfo } from "../shared/bridge"
import { findProfile } from "./profile"
import { openSettings } from "./settings"
import { createTray, trayIconPaths } from "./tray"
import { createUpdater } from "./updater"
import { Sidecar, sidecarLayer } from "./sidecar"
import { newToken, spawnSidecar } from "./sidecar-process"
import {
  applyLook,
  fixSocketOrigin,
  lockNavigation,
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

// Join links wait here until the page says it is listening. Codes are
// secrets: nothing in this file logs argv, a link or a code.
const joinInbox = createJoinInbox((code) => {
  if (window && !window.isDestroyed())
    window.webContents.send(CHANNELS.joinLink, code)
})
// A link that started this launch. Read now, so it is not lost to startup.
const startLink = findJoinLink(process.argv)
if (startLink) joinInbox.push(startLink)

function createWindow(hidden: boolean, look: WindowLook) {
  window = new BrowserWindow({
    ...windowOptions(join(import.meta.dirname, "../preload/index.cjs"), look),
    show: !hidden,
  })
  lockNavigation(window.webContents)
  // A reloaded page has no listener yet, so links wait for its next ready.
  window.webContents.on("did-start-loading", () => joinInbox.reset())
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
  // Dev runs the generic Electron binary, which must be told the app script.
  // Windows may still ask the user which app opens tailshare: links.
  // A side profile leaves tailshare: links to the main copy.
  if (!profile) {
    if (process.defaultApp && process.argv.length >= 2)
      app.setAsDefaultProtocolClient("tailshare", process.execPath, [
        resolve(process.argv[1]!),
      ])
    else app.setAsDefaultProtocolClient("tailshare")
  }

  const binary = resolveSidecarPath({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: join(app.getAppPath(), "../../.."),
  })

  const roomsDir = join(app.getPath("userData"), "rooms")
  const settings = openSettings(app.getPath("userData"), {
    downloads: app.getPath("downloads"),
  })
  let mainToken = newToken()
  let downloadsUpdate = Promise.resolve<unknown>(undefined)
  const configureDownloads = (info: ConnectionInfo) => {
    // Serialize changes and read the newest folder when each request starts.
    downloadsUpdate = downloadsUpdate
      .catch(() => {})
      .then(() =>
        callMainApi(info, mainToken, "/api/downloads", {
          folder: settings.get().saveFolder,
        })
      )
    return downloadsUpdate
  }
  const runtime = ManagedRuntime.make(
    sidecarLayer({
      spawn: (token) => {
        mainToken = newToken()
        return spawnSidecar(binary, token, roomsDir, mainToken)
      },
      newToken,
      health: async (baseUrl, token) => {
        await checkHealth(baseUrl, token)
        // ponytail: stored "ask" uses the folder too until per-file dialogs return.
        await configureDownloads({ baseUrl, token })
      },
    })
  )
  const sidecar = await runtime.runPromise(
    Effect.gen(function* () {
      return yield* Sidecar
    })
  )

  closeToTray = settings.get().closeToTray
  // Forcing light or dark here flips prefers-color-scheme in the page too.
  nativeTheme.themeSource = settings.get().theme
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
    open?.webContents.send(CHANNELS.windowState, windowState(look(mica)))
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
  registerRoomIpc(host, {
    roomsDir,
    openPath: (path) => shell.openPath(path),
    pickFiles: async () => {
      const options = {
        properties: ["openFile" as const, "multiSelections" as const],
      }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : result.filePaths
    },
    addFiles: async (paths) => {
      const info = await runtime.runPromise(sidecar.connectionInfo)
      return (await callMainApi(info, mainToken, "/api/room/files", {
        paths,
      })) as AddFilesResult
    },
  })
  registerUpdateIpc(host, settings, updater, (url) => shell.openExternal(url))
  const recentRooms = openRecentRooms(app.getPath("userData"))
  registerRecentRoomsIpc(host, recentRooms)
  recentRooms.onChange((rooms) => {
    for (const open of BrowserWindow.getAllWindows())
      open.webContents.send(CHANNELS.recentRoomsChanged, rooms)
  })
  // The preload sends this once its join-link listener is attached.
  ipcMain.on(CHANNELS.rendererReady, (event) => {
    if (event.sender === window?.webContents) joinInbox.ready()
  })
  registerWindowIpc(host, {
    state: () => windowState(look()),
  })

  // One place reacts to a saved change: updater, login item, tray flag, windows.
  settings.onChange((next, previous) => {
    closeToTray = next.closeToTray
    if (next.saveFolder !== previous.saveFolder) {
      void runtime
        .runPromise(sidecar.connectionInfo)
        .then(configureDownloads)
        .catch(() =>
          dialog.showErrorBox(
            "Downloads folder",
            "Could not set the downloads folder. Choose it again."
          )
        )
    }
    if (next.updateChannel !== previous.updateChannel)
      updater.setChannel(next.updateChannel)
    if (next.startWithWindows !== previous.startWithWindows)
      loginItem(next.startWithWindows)
    if (next.mica !== previous.mica) refreshLook(next.mica)
    if (next.theme !== previous.theme) nativeTheme.themeSource = next.theme
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

  createWindow(startsHidden(process.argv) && !startLink, look())

  tray = createTray(
    { onOpen: () => showWindow(window), onQuit: () => app.quit() },
    trayIconPaths({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    })
  )

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(false, look())
  })
}

// Windows leaves a ghost icon behind if the tray is not removed.
app.on("will-quit", () => tray?.destroy())

app.on("window-all-closed", () => {
  if (quitWhenAllClosed({ platform: process.platform, closeToTray })) app.quit()
})

// Each profile gets its own folder. The single-copy lock lives in that
// folder, so a profile runs beside the main copy instead of focusing it.
const profile = findProfile(process.argv)
if (profile) app.setPath("userData", `${app.getPath("userData")}-${profile}`)

// One copy per profile: a second launch just brings the first window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", (_event, argv) => {
    showWindow(window)

    const code = findJoinLink(argv)
    if (code) joinInbox.push(code)
  })

  main().catch((error: unknown) => {
    dialog.showErrorBox("Tailshare could not start", String(error))
    app.exit(1)
  })
}
