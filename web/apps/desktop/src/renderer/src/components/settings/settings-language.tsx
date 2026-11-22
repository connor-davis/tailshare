import { useT } from "@/i18n/provider"
import { SettingList, SettingRow } from "./setting-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SectionProps } from "./settings-fields"
import { LANGUAGES, type Language } from "../../../../shared/i18n"

// Language names stay in their own language so users can recover their choice.
const names: Record<Language, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ar: "العربية",
}

/** Select the main-owned language; changes apply to open surfaces immediately. */
export function SettingsLanguage({
  settings,
  save,
  saving,
}: Pick<SectionProps, "settings" | "save" | "saving">) {
  const t = useT()

  return (
    <SettingList>
      <SettingRow label={t("language.label")} htmlFor="language">
        <Select
          value={settings.language}
          disabled={saving}
          onValueChange={(value) => {
            const language = LANGUAGES.find((language) => language === value)
            if (language) void save({ language })
          }}
        >
          <SelectTrigger id="language" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((language) => (
              <SelectItem key={language} value={language}>
                {names[language]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingList>
  )
}
