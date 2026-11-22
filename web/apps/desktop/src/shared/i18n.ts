/** Languages whose settings values remain stable across catalog releases. */
export const LANGUAGES = ["en", "es", "fr", "de", "ar"] as const

/** A supported language preference. Only English has a catalog in E1. */
export type Language = (typeof LANGUAGES)[number]

/** Resolve an operating-system locale to a supported base language. */
export function normalizeLanguage(locale: string): Language {
  const base = locale.toLowerCase().split(/[-_]/)[0]
  return LANGUAGES.find((language) => language === base) ?? "en"
}

/** A cardinal plural message always supplies the fallback category. */
export type PluralMessage = { readonly other: string } & Partial<
  Record<Intl.LDMLPluralRule, string>
>

/** Translations preserve every source key, while allowing translated text. */
export type Catalog<Source> = {
  readonly [Key in keyof Source]: Source[Key] extends string
    ? string
    : PluralMessage
}

type Placeholders<Text extends string> =
  Text extends `${string}{${infer Param}}${infer Rest}`
    ? Param | Placeholders<Rest>
    : never
type TextOf<Message> = Message extends string
  ? Message
  : Message[keyof Message] & string
type Names<Message> =
  Placeholders<TextOf<Message>> | (Message extends string ? never : "count")
type Params<Message> = {
  [Name in Names<Message>]: Name extends "count" ? number : string | number
}

/** A translator checks keys and requires exactly the message's named values. */
export type Translator<Source> = <Key extends keyof Source>(
  key: Key,
  ...args: [Names<Source[Key]>] extends [never]
    ? []
    : [params: Params<Source[Key]>]
) => string

/** Small catalog engine; revisit a library when translation workflow needs it. */
export function createTranslator<
  Source extends Record<string, string | PluralMessage>,
>(catalog: () => Catalog<Source>, locale: () => string): Translator<Source> {
  return ((key: keyof Source, params: Record<string, string | number> = {}) => {
    const message = catalog()[key]
    const text =
      typeof message === "string"
        ? message
        : (message[
            new Intl.PluralRules(locale()).select(Number(params.count))
          ] ?? message.other)

    return text.replace(/\{([^{}]+)\}/g, (_, name: string) => {
      if (!(name in params)) throw new Error(`Missing i18n parameter: ${name}`)
      return String(params[name])
    })
  }) as Translator<Source>
}
