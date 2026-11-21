import { useCallback, useState } from "react"

/** Panel sizes are saved per computer under this key prefix. */
const PREFIX = "tailshare.layout"

/**
 * Storage that never throws. A blocked or full localStorage just means the
 * layout starts from its defaults next time.
 */
const storage = {
  getItem(key: string) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Not saving a size is harmless.
    }
  },
}

/**
 * The remaining rail visibility preference. Retired column and size keys are
 * left untouched so old saved values are harmless.
 */
export function usePanelOpen(id: "rooms"): [boolean, () => void] {
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
