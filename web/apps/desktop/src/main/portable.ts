import { dirname, join, resolve } from "node:path"

/** Detects electron-builder's portable launcher, never the extracted temp exe. */
export function isPortableRun(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.PORTABLE_EXECUTABLE_FILE || env.PORTABLE_EXECUTABLE_DIR)
}

/** Keeps identity, settings and rooms beside the portable launcher. */
export function portableDataPath(env: NodeJS.ProcessEnv): string | null {
  const directory =
    env.PORTABLE_EXECUTABLE_DIR ||
    (env.PORTABLE_EXECUTABLE_FILE
      ? dirname(env.PORTABLE_EXECUTABLE_FILE)
      : null)

  return directory ? join(directory, "Tailshare Data") : null
}

/** Registers room links only for a non-portable main profile. */
export function registerRoomProtocol(options: {
  isPortable: boolean
  profile: string | null
  defaultApp: boolean
  argv: string[]
  execPath: string
  register: (scheme: string, path?: string, args?: string[]) => unknown
}): void {
  if (options.isPortable || options.profile) return

  if (options.defaultApp && options.argv.length >= 2)
    options.register("tailshare", options.execPath, [resolve(options.argv[1]!)])
  else options.register("tailshare")
}
