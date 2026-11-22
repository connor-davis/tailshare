import type { Catalog, PluralMessage } from "./i18n"

/** Expand visible text by roughly 35%, leaving named parameters unchanged. */
export function pseudoText(text: string): string {
  const visible = text.replace(/\{[^{}]+\}/g, "")
  return `[${text}${"~".repeat(Math.ceil(visible.length * 0.35))}]`
}

/** Build the development-only en-XA catalog from the complete English source. */
export function pseudoCatalog<
  Source extends Record<string, string | PluralMessage>,
>(source: Source): Catalog<Source> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      typeof value === "string"
        ? pseudoText(value)
        : Object.fromEntries(
            Object.entries(value).map(([form, text]) => [
              form,
              pseudoText(text),
            ])
          ),
    ])
  ) as Catalog<Source>
}
