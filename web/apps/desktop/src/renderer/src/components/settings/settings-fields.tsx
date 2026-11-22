import { useT } from "@/i18n/provider"
import { SettingsLanguage } from "./settings-language"
import { useState, type ReactNode } from "react"
import { FolderIcon } from "lucide-react"
import type { Settings } from "../../../../shared/bridge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SettingList, SettingRow } from "./setting-row"
import type { SettingsHandle } from "./use-settings"

/** The biggest speed limit main accepts, in KiB per second. */
const MAX_LIMIT_KIB = 1048576

/** What every section gets: the loaded settings and the way to save them. */
export type SectionProps = SettingsHandle & { settings: Settings }

/** A titled pane, so every section looks the same. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  /** Unique id for the heading, which names the region. */
  id: string
  /** The heading. */
  title: string
  /** One line under the heading. */
  description: string
  /** The rows. */
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h3 id={id} className="text-lg font-semibold">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  )
}

/** A save button on its own row at the end of a form. */
function SaveRow({
  disabled,
  children,
}: {
  /** True when there is nothing to save. */
  disabled: boolean
  /** The button's words. */
  children: ReactNode
}) {
  return (
    <div className="flex justify-end p-3">
      <Button type="submit" disabled={disabled}>
        {children}
      </Button>
    </div>
  )
}

/** The name the other computer sees. */
export function YouSection({ settings, save, saving }: SectionProps) {
  const t = useT()

  const [name, setName] = useState(settings.displayName)

  return (
    <Section
      id="you-title"
      title={t("settingsFields.you")}
      description={t("settingsFields.howTheOtherComputerSeesYou")}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save({ displayName: name.trim() })
        }}
      >
        <SettingList>
          <SettingRow
            label={t("settingsFields.displayName")}
            htmlFor="display-name"
            description={t("settingsFields.upTo64CharactersLeaveItEmpty")}
          >
            <Input
              id="display-name"
              className="w-56"
              value={name}
              maxLength={64}
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
            />
          </SettingRow>
          <SaveRow disabled={saving || name.trim() === settings.displayName}>
            {t("settingsFields.saveName")}
          </SaveRow>
        </SettingList>
      </form>
    </Section>
  )
}

/** Where downloads go: the save folder. */
export function SavingSection({ settings, save, saving, fail }: SectionProps) {
  const t = useT()

  async function change() {
    try {
      const picked = await window.tailshare.chooseFolder()
      if (picked) await save({ saveFolder: picked })
    } catch {
      fail(t("settingsFields.couldNotOpenTheFolderPickerTry"))
    }
  }

  return (
    <Section
      id="saving-title"
      title={t("settingsFields.saving")}
      description={t("settingsFields.whatHappensToFilesYouDownload")}
    >
      <RadioGroup
        aria-label={t("settingsFields.whereDownloadsGo")}
        value={settings.saveMode}
        disabled={saving}
        className="gap-0"
        onValueChange={(value) => {
          if (value === "folder" || value === "ask")
            void save({ saveMode: value })
        }}
      >
        <SettingList>
          <SettingRow
            label={t("settingsFields.saveToMyFolder")}
            htmlFor="save-mode-folder"
            description={t("settingsFields.everyFileGoesToTheFolderBelow")}
          >
            <RadioGroupItem value="folder" id="save-mode-folder" />
          </SettingRow>
          <SettingRow
            label={t("settingsFields.askEveryTime")}
            htmlFor="save-mode-ask"
            description={t("settingsFields.pickWhereEachFileGoes")}
          >
            <RadioGroupItem value="ask" id="save-mode-ask" />
          </SettingRow>
        </SettingList>
      </RadioGroup>
      <SettingList>
        <SettingRow
          label={t("settingsFields.saveFolder")}
          description={
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex max-w-64 items-center gap-2">
                  <FolderIcon aria-hidden className="size-4 shrink-0" />
                  <span className="min-w-0 break-all">
                    {settings.saveFolder}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent>{settings.saveFolder}</TooltipContent>
            </Tooltip>
          }
        >
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => void change()}
          >
            {t("settingsFields.change")}
          </Button>
        </SettingRow>
      </SettingList>
    </Section>
  )
}

/** One whole number from a text box, or null if it is not one in range. */
function wholeNumber(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const value = Number(text)

  return value >= min && value <= max ? value : null
}

/** A number row with its hint, or its reason when the value is out of range. */
function NumberRow({
  id,
  label,
  hint,
  text,
  valid,
  onChange,
}: {
  /** Ties the label to the box. */
  id: string
  /** The setting's name. */
  label: string
  /** The rule, in plain words. Becomes the reason when the value is bad. */
  hint: string
  /** What is typed. */
  text: string
  /** False when the text is not an allowed number. */
  valid: boolean
  /** Called with the typed text. */
  onChange: (text: string) => void
}) {
  return (
    <SettingRow label={label} htmlFor={id} description={hint} invalid={!valid}>
      <Input
        id={id}
        className="w-28"
        inputMode="numeric"
        value={text}
        aria-invalid={!valid}
        onChange={(event) => onChange(event.target.value)}
      />
    </SettingRow>
  )
}

/** Speed limits and how many transfers run together. */
export function TransfersSection({ settings, save, saving }: SectionProps) {
  const t = useT()

  const [upload, setUpload] = useState(String(settings.uploadLimitKiB))
  const [download, setDownload] = useState(String(settings.downloadLimitKiB))
  const [slots, setSlots] = useState(String(settings.transfersAtOnce))

  const uploadValue = wholeNumber(upload, 0, MAX_LIMIT_KIB)
  const downloadValue = wholeNumber(download, 0, MAX_LIMIT_KIB)
  const slotsValue = wholeNumber(slots, 1, 8)
  const changed =
    uploadValue !== settings.uploadLimitKiB ||
    downloadValue !== settings.downloadLimitKiB ||
    slotsValue !== settings.transfersAtOnce

  const limitHint = t("settingsFields.kibPerSecond0To0Means", {
    MAX_LIMIT_KIB: MAX_LIMIT_KIB,
  })

  return (
    <Section
      id="transfers-title"
      title={t("settingsFields.transfers")}
      description={t("settingsFields.howFastAndHowManyAtThe")}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (uploadValue === null || downloadValue === null) return
          if (slotsValue === null) return

          void save({
            uploadLimitKiB: uploadValue,
            downloadLimitKiB: downloadValue,
            transfersAtOnce: slotsValue,
          })
        }}
      >
        <SettingList>
          <NumberRow
            id="upload-limit"
            label={t("settingsFields.uploadLimit")}
            hint={limitHint}
            text={upload}
            valid={uploadValue !== null}
            onChange={setUpload}
          />
          <NumberRow
            id="download-limit"
            label={t("settingsFields.downloadLimit")}
            hint={limitHint}
            text={download}
            valid={downloadValue !== null}
            onChange={setDownload}
          />
          <NumberRow
            id="transfers-at-once"
            label={t("settingsFields.transfersAtOnce")}
            hint={t("settingsFields.aWholeNumberFrom1To8")}
            text={slots}
            valid={slotsValue !== null}
            onChange={setSlots}
          />
          <SaveRow
            disabled={
              saving ||
              !changed ||
              uploadValue === null ||
              downloadValue === null ||
              slotsValue === null
            }
          >
            {t("settingsFields.saveTransfers")}
          </SaveRow>
        </SettingList>
      </form>
    </Section>
  )
}

/** One switch row, saved the moment it flips. */
function SwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  /** Ties the label to the switch. */
  id: string
  /** The setting's name. */
  label: string
  /** What it does, in plain words. */
  description: string
  /** Current value. */
  checked: boolean
  /** True while a save runs. */
  disabled: boolean
  /** Called with the new value. */
  onChange: (value: boolean) => void
}) {
  return (
    <SettingRow label={label} htmlFor={id} description={description}>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </SettingRow>
  )
}

/** Windows start-up, the tray and the window background. */
export function AppSection({ settings, save, saving }: SectionProps) {
  const t = useT()

  return (
    <Section
      id="app-title"
      title={t("settingsFields.app")}
      description={t("settingsFields.howTailshareLivesOnThisComputer")}
    >
      <SettingsLanguage settings={settings} save={save} saving={saving} />
      <RadioGroup
        aria-label={t("settingsFields.appearance")}
        value={settings.theme}
        disabled={saving}
        className="gap-0"
        onValueChange={(value) => {
          if (value === "system" || value === "light" || value === "dark")
            void save({ theme: value })
        }}
      >
        <SettingList>
          <SettingRow
            label={t("settingsFields.system")}
            htmlFor="theme-system"
            description={t("settingsFields.lightOrDarkWhicheverWindowsUses")}
          >
            <RadioGroupItem value="system" id="theme-system" />
          </SettingRow>
          <SettingRow label={t("settingsFields.light")} htmlFor="theme-light">
            <RadioGroupItem value="light" id="theme-light" />
          </SettingRow>
          <SettingRow label={t("settingsFields.dark")} htmlFor="theme-dark">
            <RadioGroupItem value="dark" id="theme-dark" />
          </SettingRow>
        </SettingList>
      </RadioGroup>
      <SettingList>
        <SwitchRow
          id="start-with-windows"
          label={t("settingsFields.startWithWindows")}
          description={t("settingsFields.opensHiddenInTheTrayWhenYou")}
          checked={settings.startWithWindows}
          disabled={saving}
          onChange={(value) => void save({ startWithWindows: value })}
        />
        <SwitchRow
          id="explorer-menu"
          label={t("settingsFields.sendFromExplorer")}
          description={t("settingsFields.addsSendWithTailshareToTheRight")}
          checked={settings.explorerMenu}
          disabled={saving}
          onChange={(value) => void save({ explorerMenu: value })}
        />
        <SwitchRow
          id="close-to-tray"
          label={t("settingsFields.closeToTray")}
          description={t("settingsFields.theCloseButtonHidesTheWindowUse")}
          checked={settings.closeToTray}
          disabled={saving}
          onChange={(value) => void save({ closeToTray: value })}
        />
        <SwitchRow
          id="notifications"
          label={t("settingsFields.notifications")}
          description={t("settingsFields.aWindowsAlertWhenSomeoneAsksTo")}
          checked={settings.notifications}
          disabled={saving}
          onChange={(value) => void save({ notifications: value })}
        />
        <SwitchRow
          id="background-effect"
          label={t("settingsFields.backgroundEffect")}
          description={t("settingsFields.aSoftMicaLookBehindTheWindow")}
          checked={settings.mica}
          disabled={saving}
          onChange={(value) => void save({ mica: value })}
        />
      </SettingList>
    </Section>
  )
}
