import { t } from "./i18n/index"
import { existsSync } from "node:fs"
import { join } from "node:path"

/** The sidecar file name for this platform. */
export function sidecarFileName(platform = process.platform): string {
  return platform === "win32" ? "tailshare.exe" : "tailshare"
}

/**
 * Where the sidecar binary is. Packaged builds carry it in the resources
 * folder (step 13 copies it there); development uses the repo's `bin/`, which
 * `task build` fills. Throws a plain sentence if it is missing.
 */
export function resolveSidecarPath(options: {
  packaged: boolean
  resourcesPath: string
  repoRoot: string
}): string {
  const folder = options.packaged
    ? options.resourcesPath
    : join(options.repoRoot, "bin")
  const path = join(folder, sidecarFileName())

  if (!existsSync(path)) {
    throw new Error(t("config.theSidecarProgramIsMissingAtRun", { path: path }))
  }

  return path
}
