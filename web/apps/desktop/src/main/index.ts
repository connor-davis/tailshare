import { app, BrowserWindow } from "electron"
import { join } from "node:path"

function createWindow() {
  const window = new BrowserWindow({
    title: "Tailshare",
    width: 1100,
    height: 760,
    minWidth: 480,
    minHeight: 360,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))

  // Hash routes need no document navigation; refuse all renderer navigation.
  window.webContents.on("will-navigate", (event) => event.preventDefault())
  window.webContents.on("will-redirect", (event) => event.preventDefault())
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault()
  )

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"))
  }
}

void app.whenReady().then(() => {
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
