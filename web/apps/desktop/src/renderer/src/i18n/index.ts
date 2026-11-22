import { createTranslator, type Language } from "../../../shared/i18n"
import { en } from "./en"

let language: Language = "en"
const listeners = new Set<() => void>()

/** Read the main-owned locale for formatting and non-React callbacks. */
export const getLocale = () => language

/** Follow a settings snapshot; untranslated languages use the English catalog. */
export function setLocale(next: Language): void {
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
export const t = createTranslator<typeof en>(() => en, getLocale)
