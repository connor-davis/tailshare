import { createTranslator, type Language } from "../../../shared/i18n"
import { en } from "./en"
import { catalogs } from "./catalogs"
import { pseudoCatalog } from "../../../shared/pseudo-locale"

type Locale = Language | "en-XA"
let language: Locale = "en"
const pseudo = import.meta.env.DEV ? pseudoCatalog(en) : en
const listeners = new Set<() => void>()

/** Read the main-owned locale for formatting and non-React callbacks. */
export const getLocale = () => language

/** Follow settings; en-XA is available only in development and tests. */
export function setLocale(next: Locale): void {
  if (next === "en-XA" && !import.meta.env.DEV) return
  if (language === next) return
  language = next
  for (const listener of listeners) listener()
}

/** Subscribe to locale updates without polling. */
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Translate an English-source semantic key with checked named parameters. */
export const t = createTranslator<typeof en>(
  () => (language === "en-XA" ? pseudo : catalogs[language]),
  getLocale
)
