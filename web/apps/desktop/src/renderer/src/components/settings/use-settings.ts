import { useEffect, useRef, useState } from "react"
import type { Settings, SettingsPatch } from "../../../../shared/bridge"

/** What the settings page shows when a save is refused. */
const SAVE_FAILED = "Could not save that. Check the value and try again."

/** The saved settings and a way to change them, kept in step with main. */
export interface SettingsHandle {
  /** The saved settings, or null while they load. */
  readonly settings: Settings | null
  /** A sentence for the screen, or empty when all is well. */
  readonly error: string
  /** True while a save runs. */
  readonly saving: boolean
  /** Saves a patch. Resolves to false, with `error` set, if it was refused. */
  readonly save: (patch: SettingsPatch) => Promise<boolean>
  /** Shows a sentence of the caller's own, such as a failed folder pick. */
  readonly fail: (message: string) => void
}

/**
 * Loads the settings, follows changes pushed from main and saves patches.
 * Main checks every patch, so the page never writes a half-saved state.
 */
export function useSettings(): SettingsHandle {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const pushed = useRef(false)

  useEffect(() => {
    let alive = true

    // Listen first, then read, so a change in between is not lost.
    const unsubscribe = window.tailshare.onSettingsChanged((next) => {
      pushed.current = true
      if (alive) setSettings(next)
    })

    window.tailshare.getSettings().then(
      (saved) => {
        if (alive && !pushed.current) setSettings(saved)
      },
      () => {
        if (alive)
          setError(
            "Could not load your settings. Reopen Tailshare to try again."
          )
      }
    )

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  async function save(patch: SettingsPatch): Promise<boolean> {
    setSaving(true)
    setError("")

    try {
      setSettings(await window.tailshare.updateSettings(patch))

      return true
    } catch {
      // Raw errors never reach the screen.
      setError(SAVE_FAILED)

      return false
    } finally {
      setSaving(false)
    }
  }

  return { settings, error, saving, save, fail: setError }
}
