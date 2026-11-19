import { app, BrowserWindow, dialog, ipcMain, session } from "electron"
import { join } from "node:path"
import { Effect, ManagedRuntime } from "effect"
import { CHANNELS } from "../shared/ipc-schema"
import { resolveSidecarPath } from "./config"
import { checkHealth } from "./health"
import { registerIpc } from "./ipc"
import { Sidecar, sidecarLayer } from "./sidecar"
import { newToken, spawnSidecar } from "./sidecar-process"
import { fixSocketOrigin, lockNavigation, windowOptions } from "./window"

let window: BrowserWindow | null = null
let quitting = false

function createWindow() {
  window = new BrowserWindow(
    windowOptions(join(import.meta.dirname, "../preload/index.cjs"))
  )
  lockNavigation(window.webContents)

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"))
  }
}

async function main() {
  await app.whenReady()

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

  await runtime.runPromise(
    registerIpc({
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
    })
  )

  sidecar.onStatus((status) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send(CHANNELS.sidecarStatus, status)
    }
  })

  // Quit waits for the sidecar to stop (stdin closes, then a kill if needed).
  app.on("before-quit", (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    void runtime.dispose().finally(() => app.quit())
  })

  // The packaged page is file://, and its socket needs the Origin the sidecar knows.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ["ws://127.0.0.1:*/*"] },
    (details, callback) =>
      callback({ requestHeaders: fixSocketOrigin(details.requestHeaders) })
  )

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

main().catch((error: unknown) => {
  dialog.showErrorBox("Tailshare could not start", String(error))
  app.exit(1)
})
