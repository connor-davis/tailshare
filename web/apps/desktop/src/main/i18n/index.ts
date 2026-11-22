import { createTranslator, type Language } from "../../shared/i18n"
import { en } from "./en"

let language: Language = "en"

/** Apply the same persisted language as the renderer. */
export function setMainLocale(next: Language): void {
  language = next
}

/** Main never loads renderer code; missing catalogs fall back to English. */
export const t = createTranslator<typeof en>(
  () => en,
  () => language
)
