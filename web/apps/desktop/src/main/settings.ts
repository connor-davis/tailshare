import { randomUUID } from "node:crypto"
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import type { Settings, UpdateChannel } from "../shared/bridge"

/** Opens the minimal desktop settings store under Electron's userData folder. */
export function openSettings(directory: string) {
  const file = join(directory, "settings.json")
  let current: Settings = { updateChannel: "latest" }

  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
    if (
      parsed &&
      typeof parsed === "object" &&
      "updateChannel" in parsed &&
      (parsed.updateChannel === "latest" || parsed.updateChannel === "nightly")
    ) {
      current = { updateChannel: parsed.updateChannel }
    }
  } catch {
    // A missing or damaged preferences file must never stop sharing.
  }

  return {
    get: (): Settings => ({ ...current }),
    setUpdateChannel(channel: UpdateChannel): Settings {
      if (channel !== "latest" && channel !== "nightly")
        throw new Error("Choose Stable or Nightly.")
      const next: Settings = { updateChannel: channel }
      const temporary = `${file}.${randomUUID()}.tmp`

      try {
        mkdirSync(directory, { recursive: true })
        writeFileSync(temporary, JSON.stringify(next) + "\n", {
          flag: "wx",
          mode: 0o600,
        })
        renameSync(temporary, file)
        current = next
      } catch {
        throw new Error(
          "Tailshare could not save your update channel. Try again."
        )
      } finally {
        rmSync(temporary, { force: true })
      }

      return { ...current }
    },
  }
}

/** The preferences boundary used by main and IPC. */
export type SettingsStore = ReturnType<typeof openSettings>
