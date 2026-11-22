/** What the login item needs from Electron's `app`. */
export interface LoginItemHost {
  setLoginItemSettings(settings: {
    openAtLogin: boolean
    path: string
    args: string[]
  }): void
}

/**
 * Turns "Start with Windows" on or off. Only an installed build registers:
 * a dev run would put electron.exe in the Windows startup list.
 */
export function applyLoginItem(
  enabled: boolean,
  options: {
    packaged: boolean
    isPortable?: boolean
    execPath: string
    host: LoginItemHost
  }
): void {
  if (!options.packaged || options.isPortable) return

  options.host.setLoginItemSettings({
    openAtLogin: enabled,
    path: options.execPath,
    args: ["--hidden"],
  })
}
