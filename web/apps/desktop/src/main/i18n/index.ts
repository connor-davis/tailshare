import { createTranslator, type Language } from "../../shared/i18n"
import { en } from "./en"
import { catalogs } from "./catalogs"

let language: Language = "en"

/** Apply the same persisted language as the renderer. */
export function setMainLocale(next: Language): void {
  language = next
}

/** Main uses the same language preference without loading renderer code. */
export const t = createTranslator<typeof en>(
  () => catalogs[language],
  () => language
)
