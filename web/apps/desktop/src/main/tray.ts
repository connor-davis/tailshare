import { join } from "node:path"
import { Menu, Tray, nativeImage } from "electron"

/** The words on the tray icon's hover text. */
export const TRAY_TOOLTIP = "Tailshare"

/** What the tray menu does. */
export interface TrayActions {
  readonly onOpen: () => void
  readonly onQuit: () => void
}

/** The tray menu: Open and Quit. A plain list, so tests need no Electron. */
export const trayMenuTemplate = (actions: TrayActions) => [
  { label: "Open Tailshare", click: actions.onOpen },
  { type: "separator" as const },
  { label: "Quit", click: actions.onQuit },
]

/**
 * Where the tray icons are. The installer copies them next to the app
 * (`extraResources` in electron-builder.yml); in dev they sit in `build/`.
 */
export function trayIconPaths(where: {
  packaged: boolean
  resourcesPath: string
  appPath: string
}) {
  const folder = where.packaged
    ? where.resourcesPath
    : join(where.appPath, "build")
  return {
    small: join(folder, "tray-16.png"),
    large: join(folder, "tray-32.png"),
  }
}

/** Puts Tailshare in the tray. A click on the icon opens the window. */
export function createTray(
  actions: TrayActions,
  paths: ReturnType<typeof trayIconPaths>
): Tray {
  // The 32px file is for screens at 200% scale.
  const icon = nativeImage.createFromPath(paths.small)
  icon.addRepresentation({
    scaleFactor: 2,
    buffer: nativeImage.createFromPath(paths.large).toPNG(),
  })

  const tray = new Tray(icon)
  tray.setToolTip(TRAY_TOOLTIP)
  tray.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate(actions)))
  tray.on("click", actions.onOpen)
  return tray
}
