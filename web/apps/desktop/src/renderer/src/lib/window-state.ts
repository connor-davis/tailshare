import { useEffect, useState } from "react"
import type { WindowState } from "../../../shared/bridge"

const INITIAL: WindowState = { maximized: false, mica: false }

/**
 * Follows the window: whether it is maximised and whether Mica is really on.
 * It sets `html.mica` so the page goes see-through only when main says Mica is
 * on (never on Windows 10, where the page keeps its solid background).
 * Call it once, from the root route.
 */
export function useWindowState(): WindowState {
  const [state, setState] = useState(INITIAL)

  useEffect(() => {
    // Listen first, then read, so a change in between is not lost.
    const unsubscribe = window.tailshare.onWindowState(setState)
    window.tailshare.getWindowState().then(setState, () => undefined)

    return unsubscribe
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("mica", state.mica)
  }, [state.mica])

  return state
}
