import type { PluralMessage } from "./i18n"

type Messages = Record<string, string | PluralMessage>
const params = (text: string) =>
  [
    ...new Set([...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])),
  ].sort()

/** Report catalog key, parameter and locale-specific plural mismatches. */
export function checkCatalog(
  source: Messages,
  catalog: Messages,
  locale: string
) {
  const problems: string[] = []
  if (
    Object.keys(source).sort().join() !== Object.keys(catalog).sort().join()
  ) {
    problems.push("keys differ")
  }
  const categories = new Intl.PluralRules(locale)
    .resolvedOptions()
    .pluralCategories.sort()
  for (const [key, message] of Object.entries(source)) {
    const translated = catalog[key]
    if (typeof message !== typeof translated || !translated) {
      problems.push(`${key}: wrong message type`)
      continue
    }
    const expected = params(
      typeof message === "string" ? message : message.other
    )
    const forms =
      typeof translated === "string" ? [translated] : Object.values(translated)
    if (
      typeof translated !== "string" &&
      Object.keys(translated).sort().join() !== categories.join()
    ) {
      problems.push(`${key}: plural forms differ`)
    }
    for (const text of forms) {
      if (
        !text.trim() ||
        JSON.stringify(params(text)) !== JSON.stringify(expected)
      ) {
        problems.push(`${key}: parameters differ or text is empty`)
      }
    }
  }
  return problems
}
