import { expect, it } from "vitest"
import { catalogs } from "./catalogs"
import { LANGUAGES } from "../../../shared/i18n"
import { checkCatalog } from "../../../shared/catalog-validation"
import { pseudoCatalog } from "../../../shared/pseudo-locale"

it.each(LANGUAGES)(
  "has exactly the English keys and parameters and all %s plural forms",
  (locale) => {
    expect(checkCatalog(catalogs.en, catalogs[locale], locale)).toEqual([])
  }
)

it("keeps the complete en-XA pseudo-catalog valid", () => {
  expect(
    checkCatalog(catalogs.en, pseudoCatalog(catalogs.en), "en-XA")
  ).toEqual([])
})
