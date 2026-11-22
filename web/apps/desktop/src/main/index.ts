import { setMainLocale } from "./i18n"
import { t } from "./i18n/index"
import {
  app,
  Menu,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  Notification,
  session,
  shell,
  type Tray,
} from "electron"
import { lstatSync, mkdirSync, rmSync } from "node:fs"
import { release } from "node:os"
import { join } from "node:path"
import { Effect, ManagedRuntime } from "effect"
import updaterPackage from "electron-updater"
import { CHANNELS } from "../shared/ipc-schema"
import { resolveSidecarPath } from "./config"
import { createDownloads } from "./downloads"
import { createLimits } from "./limits"
import { createRelayRegion } from "./relay-region"
import { loadIdentity } from "./identity"
import { createTrusted, registerTrustedIpc } from "./trusted"
import { checkHealth } from "./health"
import {
  registerDownloadsIpc,
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
import { registerNotifyIpc, toastText } from "./notify"
import { applyExplorerMenu } from "./explorer-menu"
import { createSendBatch, findSendPaths, sendToOpenRoom } from "./send-files"
import { createSavedDownloads, registerSavedIpc } from "./saved-downloads"
import { openRecentRooms } from "./recent-rooms"
import { callMainApi, registerRoomIpc } from "./room-ipc"
import type { AddFilesResult } from "../shared/bridge"
import { findProfile } from "./profile"
import {
  isPortableRun,
  portableDataPath,
  registerRoomProtocol,
} from "./portable"
import { configureWindowsArmUpdates } from "./update-provider"
import { openSettings } from "./settings"
import { createTray, trayIconPaths, trayMenuTemplate } from "./tray"
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
const startupSends = findSendPaths(process.argv)
let sendBatch: ReturnType<typeof createSendBatch> | undefined

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
  registerRoomProtocol({
    isPortable,
    profile,
    defaultApp: Boolean(process.defaultApp),
    argv: process.argv,
    execPath: process.execPath,
    register: (...args) => app.setAsDefaultProtocolClient(...args),
  })

  const binary = resolveSidecarPath({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: join(app.getAppPath(), "../../.."),
  })

  const roomsDir = join(app.getPath("userData"), "rooms")
  // Pasted pictures wait here for a moment. A crash can leave one behind.
  const pasteDir = join(app.getPath("userData"), "paste")
  rmSync(pasteDir, { recursive: true, force: true })

  const settings = openSettings(app.getPath("userData"), {
    downloads: app.getPath("downloads"),
    locale: app.getLocale(),
  })

  setMainLocale(settings.get().language)

  let mainToken = newToken()
  // One key per install, so a host can tell this computer from a stranger.
  const identity = loadIdentity(app.getPath("userData"))

  const downloads = createDownloads({
    configure: async () =>
      callMainApi(
        await runtime.runPromise(sidecar.connectionInfo),
        mainToken,
        "/api/downloads",
        { folder: settings.get().saveFolder }
      ),
    onChange: (status) => {
      if (window && !window.isDestroyed())
        window.webContents.send(CHANNELS.downloadsStatus, status)
    },
  })

  const limits = createLimits({
    settings: () => settings.get(),
    send: async (body) =>
      callMainApi(
        await runtime.runPromise(sidecar.connectionInfo),
        mainToken,
        "/api/transfers/limits",
        body
      ),
  })

  const callMain = async (
    route: Parameters<typeof callMainApi>[2],
    body?: unknown
  ) =>
    callMainApi(
      await runtime.runPromise(sidecar.connectionInfo),
      mainToken,
      route,
      body
    )

  const trusted = createTrusted({
    settings,
    push: (body) => callMain("/api/session/trusted", body),
    joinKey: (id) => callMain(`/api/session/joins/${id}/key`),
    allow: (id) => callMain(`/api/session/joins/${id}/allow`, {}),
  })

  const relayRegion = createRelayRegion({
    settings: () => settings.get(),
    send: async (body) =>
      callMainApi(
        await runtime.runPromise(sidecar.connectionInfo),
        mainToken,
        "/api/connection/region",
        body
      ),
  })

  const runtime = ManagedRuntime.make(
    sidecarLayer({
      spawn: (token) => {
        mainToken = newToken()

        return spawnSidecar(
          binary,
          token,
          roomsDir,
          mainToken,
          identity,
          settings.get().relayRegion
        )
      },
      newToken,
      // A bad save folder must not look like a dead engine, so it is applied
      // after ready instead (see `downloads`).
      health: checkHealth,
    })
  )

  const sidecar = await runtime.runPromise(
    Effect.gen(function* () {
      return yield* Sidecar
    })
  )

  // Every start, first or after a crash, gives the sidecar the save folder.
  sidecar.onStatus((status) => {
    if (status === "ready") {
      void downloads.apply()
      void limits.apply()
      void relayRegion.apply()
      void trusted.apply()
    }
  })

  if (sidecar.status() === "ready") {
    void downloads.apply()
    void limits.apply()
    void relayRegion.apply()
    void trusted.apply()
  }

  closeToTray = settings.get().closeToTray
  // Forcing light or dark here flips prefers-color-scheme in the page too.
  nativeTheme.themeSource = settings.get().theme

  const loginItem = (enabled: boolean) =>
    applyLoginItem(enabled, {
      packaged: app.isPackaged,
      isPortable,
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

  configureWindowsArmUpdates(
    updaterPackage.autoUpdater,
    process.platform,
    process.arch
  )

  const updater = createUpdater({
    packaged: app.isPackaged,
    isPortable,
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
        handler(
          event.sender === window?.webContents &&
            event.senderFrame === window?.webContents.mainFrame,
          args
        )
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

  const recentRooms = openRecentRooms(app.getPath("userData"))

  const saved = createSavedDownloads()

  const trayIcons = trayIconPaths({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  })

  const roomFiles = registerRoomIpc(host, {
    roomsDir,
    pasteDir,
    saveFolder: () => settings.get().saveFolder,
    roomSaveFolder: (code) => recentRooms.folderFor(code),
    setRoomFolder: (code, folder, name) =>
      void recentRooms.setFolder(code, folder, name),
    remember: (item, folder) => saved.remember(item, folder),
    clipboard: {
      // Electron 45's clipboard is async and hands out typed items.
      readPng: async () => {
        for (const item of await clipboard.read()) {
          if (!item.types.includes("image/png")) continue

          const blob = await item.getType("image/png")

          return Buffer.from(await blob.arrayBuffer())
        }

        return null
      },
      readText: () => clipboard.readText(),
    },
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
    pickFolder: () => host.pickFolder(),
    saveFolderTree: async (request) =>
      callMainApi(
        await runtime.runPromise(sidecar.connectionInfo),
        mainToken,
        "/api/transfers/folder",
        request,
        600_000
      ),
    saveMode: () => settings.get().saveMode,
    pickSaveFile: async (name) => {
      const options = { defaultPath: name }

      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)

      return result.canceled ? null : (result.filePath ?? null)
    },
    saveToFolder: async ({ source, name }) =>
      callMainApi(
        await runtime.runPromise(sidecar.connectionInfo),
        mainToken,
        "/api/transfers",
        { direction: "download", source, destination: name }
      ),
    saveInto: async (request) =>
      callMainApi(
        await runtime.runPromise(sidecar.connectionInfo),
        mainToken,
        "/api/transfers/save",
        request
      ),
    addFiles: async (paths, roomCode) => {
      const info = await runtime.runPromise(sidecar.connectionInfo)

      const hasFolder = paths.some((path) => {
        try {
          return lstatSync(path).isDirectory()
        } catch {
          return false
        }
      })

      return (await callMainApi(
        info,
        mainToken,
        "/api/room/files",
        {
          paths,
          ...(roomCode ? { roomCode } : {}),
        },
        hasFolder ? 600_000 : 120_000
      )) as AddFilesResult
    },
  })

  const showToast = ({ title, body }: { title: string; body: string }) => {
    if (!Notification.isSupported()) return

    const toast = new Notification({ title, body })
    toast.on("click", () => showWindow(window))
    toast.show()
  }

  sendBatch = createSendBatch(async (paths) => {
    await sendToOpenRoom(paths, {
      currentRoom: roomFiles.currentRoom,
      connected: async () => {
        const session = (await callMainApi(
          await runtime.runPromise(sidecar.connectionInfo),
          mainToken,
          "/api/session",
          undefined
        )) as { state: string }

        return session.state === "connected"
      },
      add: roomFiles.add,
      post: async (name, roomCode) => {
        await callMainApi(
          await runtime.runPromise(sidecar.connectionInfo),
          mainToken,
          "/api/chat",
          { text: "", attachment: { path: name }, roomCode }
        )
      },
      showWindow: () => showWindow(window),
      noRoom: () => showToast(toastText("send", "")),
    })
  })

  registerNotifyIpc(host, {
    enabled: () => settings.get().notifications,
    windowActive: () => {
      const open = liveWindow()

      return !!open && open.isVisible() && open.isFocused()
    },
    show: showToast,
  })

  const dragIcon = nativeImage.createFromPath(trayIcons.large)
  registerSavedIpc(host, saved, {
    startDrag: (file) =>
      liveWindow()?.webContents.startDrag({ file, icon: dragIcon }),
    reveal: (file) => shell.showItemInFolder(file),
    preview: async ({ folder, name }) =>
      callMainApi(
        await runtime.runPromise(sidecar.connectionInfo),
        mainToken,
        "/api/downloads/preview",
        { folder, name }
      ),
  })

  registerUpdateIpc(host, settings, updater, (url) => shell.openExternal(url))
  registerRecentRoomsIpc(host, recentRooms)
  registerTrustedIpc(host, trusted)
  recentRooms.onChange((rooms) => {
    for (const open of BrowserWindow.getAllWindows())
      open.webContents.send(CHANNELS.recentRoomsChanged, rooms)
  })
  // The preload sends this once its join-link listener is attached.
  ipcMain.on(CHANNELS.rendererReady, (event) => {
    if (event.sender === window?.webContents) joinInbox.ready()
  })

  registerDownloadsIpc(host, downloads.status)
  registerWindowIpc(host, {
    state: () => windowState(look()),
  })

  let menuUpdate = Promise.resolve()

  const explorerMenu = (enabled: boolean) => {
    menuUpdate = menuUpdate
      .then(() =>
        applyExplorerMenu(enabled, {
          packaged: app.isPackaged,
          isPortable,
          execPath: process.execPath,
        })
      )
      .catch(() => {
        // Registry errors never include the executable path in logs.
        console.warn(t("index.couldNotUpdateTheExplorerMenu"))
      })
  }
  // One place reacts to a saved change: updater, login item, tray flag, windows.
  settings.onChange((next, previous) => {
    setMainLocale(next.language)
    if (next.language !== previous.language) {
      tray?.setContextMenu(
        Menu.buildFromTemplate(
          trayMenuTemplate({
            onOpen: () => showWindow(window),
            onQuit: () => app.quit(),
          })
        )
      )
      explorerMenu(next.explorerMenu)
    }
    closeToTray = next.closeToTray
    if (next.saveFolder !== previous.saveFolder) void downloads.apply()
    if (
      next.transfersAtOnce !== previous.transfersAtOnce ||
      next.uploadLimitKiB !== previous.uploadLimitKiB ||
      next.downloadLimitKiB !== previous.downloadLimitKiB
    )
      void limits.apply()
    if (next.relayRegion !== previous.relayRegion) void relayRegion.apply()
    // Compare by content: every save decodes a fresh list.
    if (
      JSON.stringify(next.trustedComputers) !==
      JSON.stringify(previous.trustedComputers)
    )
      void trusted.apply()
    if (next.updateChannel !== previous.updateChannel)
      updater.setChannel(next.updateChannel)
    if (next.startWithWindows !== previous.startWithWindows)
      loginItem(next.startWithWindows)
    if (next.explorerMenu !== previous.explorerMenu)
      explorerMenu(next.explorerMenu)
    if (next.mica !== previous.mica) refreshLook(next.mica)
    if (next.theme !== previous.theme) nativeTheme.themeSource = next.theme
    for (const open of BrowserWindow.getAllWindows())
      open.webContents.send(CHANNELS.settingsChanged, next)
  })
  // The solid fallback follows the system theme.
  nativeTheme.on("updated", () => refreshLook())
  // Keeps the entry pointing at this build after an update moves it.
  loginItem(settings.get().startWithWindows)
  explorerMenu(settings.get().explorerMenu)

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

  createWindow(
    startsHidden(process.argv) && !startLink && !startupSends.length,
    look()
  )
  sendBatch.push(startupSends.splice(0))

  tray = createTray(
    { onOpen: () => showWindow(window), onQuit: () => app.quit() },
    trayIcons
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

// Choose portable storage before Electron takes its single-copy lock.
const isPortable = isPortableRun(process.env)
const portableData = portableDataPath(process.env)
if (portableData) {
  mkdirSync(portableData, { recursive: true })
  app.setPath("userData", portableData)
}

// Each profile gets its own folder. The single-copy lock lives in that
// folder, so a profile runs beside the main copy instead of focusing it.
const profile = findProfile(process.argv)
if (profile) app.setPath("userData", `${app.getPath("userData")}-${profile}`)
// Chromium caches and session state must travel with the portable profile too.
if (isPortable) app.setPath("sessionData", app.getPath("userData"))

// One copy per profile: a second launch just brings the first window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", (_event, argv) => {
    showWindow(window)

    const paths = findSendPaths(argv)
    if (sendBatch) sendBatch.push(paths)
    else startupSends.push(...paths)
    const code = findJoinLink(argv)
    if (code) joinInbox.push(code)
  })

  main().catch((error: unknown) => {
    dialog.showErrorBox(t("index.tailshareCouldNotStart"), String(error))
    app.exit(1)
  })
}
