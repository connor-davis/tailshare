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

/** English is selectable until the translated catalogs have been checked. */
export function SettingsLanguage({
  save,
  saving,
}: Pick<SectionProps, "save" | "saving">) {
  const t = useT()

  return (
    <SettingList>
      <SettingRow label={t("language.label")} htmlFor="language">
        <Select
          value="en"
          disabled={saving}
          onValueChange={(value) => {
            if (value === "en") void save({ language: value })
          }}
        >
          <SelectTrigger id="language" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t("language.english")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingList>
  )
}
