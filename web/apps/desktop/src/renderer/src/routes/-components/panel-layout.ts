import { useCallback, useState } from "react"
import { useDefaultLayout, type LayoutStorage } from "react-resizable-panels"

/** Panel sizes are saved per computer under this key prefix. */
const PREFIX = "tailshare.layout"

/**
 * Storage that never throws. A blocked or full localStorage just means the
 * layout starts from its defaults next time.
 */
const storage: LayoutStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Not saving a size is harmless.
    }
  },
}

/**
 * Saved sizes for one panel group. Spread the result onto
 * `ResizablePanelGroup`. Only sizes are stored, never room data. Pass the ids
 * of the panels that are shown, so each combination keeps its own sizes.
 */
export function usePanelLayout(id: string, panelIds?: string[]) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `${PREFIX}.${id}`,
    panelIds,
    storage,
  })

  return { defaultLayout, onLayoutChanged }
}

/**
 * Whether a panel is shown, saved with the sizes. Panels never collapse by
 * dragging; only the toggle button flips this.
 */
export function usePanelOpen(id: string): [boolean, () => void] {
  const key = `${PREFIX}.${id}.open`
  const [open, setOpen] = useState(() => storage.getItem(key) !== "false")

  const toggle = useCallback(() => {
    setOpen((current) => {
      storage.setItem(key, String(!current))

      return !current
    })
  }, [key])

  return [open, toggle]
}
