import { t } from "./i18n/index"
import { execFile } from "node:child_process"

/** The only per-user registry keys owned by the Explorer menu. */
export const explorerKeys = [
  "HKCU\\Software\\Classes\\*\\shell\\Tailshare",
  "HKCU\\Software\\Classes\\Directory\\shell\\Tailshare",
] as const

/** Applies the packaged app's menu through reg.exe, with no shell or elevation. */
export async function applyExplorerMenu(
  enabled: boolean,
  options: {
    packaged: boolean
    execPath: string
    run?: (args: string[]) => Promise<void>
  }
) {
  if (!options.packaged) return

  const run =
    options.run ??
    ((args: string[]) =>
      new Promise<void>((resolve, reject) => {
        execFile("reg.exe", args, { windowsHide: true }, (error) =>
          error
            ? reject(new Error(t("explorerMenu.couldNotUpdateTheExplorerMenu")))
            : resolve()
        )
      }))
  for (const key of explorerKeys) {
    if (!enabled) {
      // Deleting an already absent key is the desired end state.
      await run(["delete", key, "/f"]).catch(() => {})
      continue
    }

    await run([
      "add",
      key,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      t("explorerMenu.sendWithTailshare"),
      "/f",
    ])
    await run([
      "add",
      `${key}\\command`,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      `"${options.execPath}" --send "%1"`,
      "/f",
    ])
  }
}
