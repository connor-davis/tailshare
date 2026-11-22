import type { Catalog, Language } from "../../../shared/i18n"
import { en } from "./en"
import { es } from "./es"
import { fr } from "./fr"
import { de } from "./de"
import { ar } from "./ar"

/** Complete shipped UI catalogs, indexed by persisted preference. */
export const catalogs: Record<Language, Catalog<typeof en>> = {
  en,
  es,
  fr,
  de,
  ar,
}
