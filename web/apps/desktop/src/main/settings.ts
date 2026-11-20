import { randomUUID } from "node:crypto"
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir, hostname } from "node:os"
import { join } from "node:path"
import { Schema } from "effect"
import type { Settings } from "../shared/bridge"
import { SETTINGS_FIELDS, SettingsSchema } from "../shared/ipc-schema"

/** Where the machine-specific defaults come from. Tests pass their own. */
export interface SettingsDefaults {
  /** The user's Downloads folder. Downloads land in `Tailshare` inside it. */
  readonly downloads?: string
  /** The computer name, used until the user picks a display name. */
  readonly computerName?: string
}

/** A refusal whose message is safe to show on screen. */
export class SettingsError extends Error {}

const invalid = () =>
  new SettingsError("Those settings are not valid. Check them and try again.")

/** The values a fresh install starts with. */
export function defaultSettings(from: SettingsDefaults = {}): Settings {
  const name = (from.computerName ?? hostname()).trim().slice(0, 64)
  return {
    updateChannel: "latest",
    displayName: name || "Tailshare",
    saveMode: "folder",
    saveFolder: join(
      from.downloads ?? join(homedir(), "Downloads"),
      "Tailshare"
    ),
    uploadLimitKiB: 0,
    downloadLimitKiB: 0,
    transfersAtOnce: 2,
    startWithWindows: false,
    closeToTray: false,
    mica: true,
    theme: "system",
  }
}

const isField = (key: string): key is keyof Settings => key in SETTINGS_FIELDS

/** Opens the desktop settings store under Electron's userData folder. */
export function openSettings(directory: string, from: SettingsDefaults = {}) {
  const file = join(directory, "settings.json")
  const defaults = defaultSettings(from)
  const listeners = new Set<(next: Settings, previous: Settings) => void>()
  const decodeField = (key: keyof Settings, value: unknown) =>
    Schema.decodeUnknownSync(SETTINGS_FIELDS[key] as never)(value)

  // A blank name means "use the computer name".
  const clean = (key: string, value: unknown) =>
    key === "displayName" && typeof value === "string"
      ? value.trim() || defaults.displayName
      : value

  let current = load()

  function load(): Settings {
    let text: string
    try {
      text = readFileSync(file, "utf8")
    } catch {
      return defaults
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      // Keep the bad file so nothing is lost, and start from the defaults.
      try {
        renameSync(file, `${file}.bak`)
      } catch {
        // Still better to run on the defaults than to stop sharing.
      }
      return defaults
    }

    // Field by field: one bad value must not reset the rest.
    const next: Record<string, unknown> = { ...defaults }
    for (const [key, value] of Object.entries(parsed)) {
      if (!isField(key)) continue
      try {
        next[key] = decodeField(key, clean(key, value))
      } catch {
        // Keeps the default for this field.
      }
    }
    return next as unknown as Settings
  }

  return {
    get: (): Settings => ({ ...current }),

    /**
     * Checks the whole patch first, then saves it. A bad patch changes
     * nothing and runs no listener.
     */
    update(patch: unknown): Settings {
      if (!patch || typeof patch !== "object" || Array.isArray(patch))
        throw invalid()

      const next: Record<string, unknown> = { ...current }
      for (const [key, value] of Object.entries(patch)) {
        if (!isField(key)) throw invalid()
        try {
          next[key] = decodeField(key, clean(key, value))
        } catch {
          throw invalid()
        }
      }

      const settings = Schema.decodeUnknownSync(SettingsSchema)(next)
      const previous = current
      const temporary = `${file}.${randomUUID()}.tmp`

      try {
        mkdirSync(directory, { recursive: true })
        writeFileSync(temporary, JSON.stringify(settings) + "\n", {
          flag: "wx",
          mode: 0o600,
        })
        renameSync(temporary, file)
      } catch {
        throw new SettingsError(
          "Tailshare could not save your settings. Try again."
        )
      } finally {
        rmSync(temporary, { force: true })
      }

      current = settings
      for (const listener of listeners) listener({ ...settings }, previous)
      return { ...settings }
    },

    /** Calls `listener` after each saved change. Returns an unsubscribe. */
    onChange(listener: (next: Settings, previous: Settings) => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/** The preferences boundary used by main and IPC. */
export type SettingsStore = ReturnType<typeof openSettings>
