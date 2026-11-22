import { Direction } from "radix-ui"
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

/** Text direction for a locale: only Arabic runs RTL so far. */
export const localeDir = (locale: string) => (locale === "ar" ? "rtl" : "ltr")

/** Load and follow the locale owned by main settings. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const dir = localeDir(locale)

  // The document carries lang and dir so CSS logical properties and the
  // browser's own text handling follow the language.
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
  }, [locale, dir])

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

  return <Direction.Provider dir={dir}>{children}</Direction.Provider>
}
