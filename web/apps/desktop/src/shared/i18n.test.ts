import { describe, expect, it } from "vitest"
import { createTranslator, normalizeLanguage, type Catalog } from "./i18n"

const source = {
  greeting: "Hello, {name}.",
  files: { one: "{count} file for {name}", other: "{count} files for {name}" },
  ready: "Ready",
} as const

function typeContracts() {
  const t = createTranslator<typeof source>(
    () => source,
    () => "en"
  )
  // @ts-expect-error Unknown keys cannot reach a shipped catalog.
  t("missing")
  // @ts-expect-error The source placeholder requires a value.
  t("greeting")
  // @ts-expect-error A misspelled parameter is refused.
  t("greeting", { label: "Pat" })
  // @ts-expect-error Plural selection requires a numeric count.
  t("files", { count: "2", name: "Pat" })
  // @ts-expect-error Translations must cover the complete source catalog.
  const incomplete: Catalog<typeof source> = { ready: "Prêt" }
  void incomplete
}
void typeContracts

describe("typed catalog engine", () => {
  it("normalizes supported OS base languages and falls back to English", () => {
    expect(
      ["en-US", "ES_mx", "fr-CA", "de-DE", "ar-SA", "ja-JP", ""].map(
        normalizeLanguage
      )
    ).toEqual(["en", "es", "fr", "de", "ar", "en", "en"])
  })

  it("interpolates values literally without interpreting user braces or dollars", () => {
    const t = createTranslator<typeof source>(
      () => source,
      () => "en"
    )
    expect(t("greeting", { name: "$& {count}" })).toBe("Hello, $& {count}.")
    expect(t("ready")).toBe("Ready")
    expect(t("files", { count: 1, name: "Pat" })).toBe("1 file for Pat")
    expect(t("files", { count: 0, name: "Pat" })).toBe("0 files for Pat")
    expect(t("files", { count: 2, name: "Pat" })).toBe("2 files for Pat")
  })

  it("uses the active locale's plural rules and the required other fallback", () => {
    const french: Catalog<typeof source> = {
      greeting: "Bonjour, {name}.",
      files: {
        one: "{count} fichier pour {name}",
        other: "{count} fichiers pour {name}",
      },
      ready: "Prêt",
    }
    const t = createTranslator<typeof source>(
      () => french,
      () => "fr"
    )
    expect(t("files", { count: 0, name: "Pat" })).toBe("0 fichier pour Pat")
    expect(t("files", { count: 2, name: "Pat" })).toBe("2 fichiers pour Pat")
    const arabic = createTranslator<typeof source>(
      () => source,
      () => "ar"
    )
    expect(arabic("files", { count: 2, name: "Pat" })).toBe("2 files for Pat")
  })
})
