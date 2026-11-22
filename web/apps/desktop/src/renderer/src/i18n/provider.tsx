import { useEffect, useSyncExternalStore, type ReactNode } from "react"
import { getLocale, setLocale, subscribeLocale, t } from "./index"

/** React subscription for the locale owned by desktop main. */
export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale)
}

/** Subscribe a component to language changes and return the typed translator. */
export function useT() {
  useLocale()
  return t
}

/** Load and follow the locale owned by main settings. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let alive = true
    let pushed = false
    const unsubscribe = window.tailshare.onSettingsChanged((settings) => {
      pushed = true
      if (alive) setLocale(settings.language)
    })
    void window.tailshare.getSettings().then(
      (settings) => {
        if (alive && !pushed) setLocale(settings.language)
      },
      () => {}
    )

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return children
}
