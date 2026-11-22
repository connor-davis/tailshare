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
  const [name, setName] = useState(settings.displayName)

  return (
    <Section
      id="you-title"
      title="You"
      description="How the other computer sees you."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save({ displayName: name.trim() })
        }}
      >
        <SettingList>
          <SettingRow
            label="Display name"
            htmlFor="display-name"
            description="Up to 64 characters. Leave it empty to use this computer's name."
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
            Save name
          </SaveRow>
        </SettingList>
      </form>
    </Section>
  )
}

/** Where downloads go: the save folder. */
export function SavingSection({ settings, save, saving, fail }: SectionProps) {
  async function change() {
    try {
      const picked = await window.tailshare.chooseFolder()
      if (picked) await save({ saveFolder: picked })
    } catch {
      fail("Could not open the folder picker. Try again.")
    }
  }

  return (
    <Section
      id="saving-title"
      title="Saving"
      description="What happens to files you download."
    >
      <RadioGroup
        aria-label="Where downloads go"
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
            label="Save to my folder"
            htmlFor="save-mode-folder"
            description="Every file goes to the folder below."
          >
            <RadioGroupItem value="folder" id="save-mode-folder" />
          </SettingRow>
          <SettingRow
            label="Ask every time"
            htmlFor="save-mode-ask"
            description="Pick where each file goes."
          >
            <RadioGroupItem value="ask" id="save-mode-ask" />
          </SettingRow>
        </SettingList>
      </RadioGroup>
      <SettingList>
        <SettingRow
          label="Save folder"
          description={
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex max-w-64 items-center gap-2">
                  <FolderIcon aria-hidden className="size-4 shrink-0" />
                  <span tabIndex={0} className="min-w-0 truncate">
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
            Change
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

  const limitHint = `KiB per second, 0 to ${MAX_LIMIT_KIB}. 0 means no limit.`

  return (
    <Section
      id="transfers-title"
      title="Transfers"
      description="How fast, and how many at the same time."
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
            label="Upload limit"
            hint={limitHint}
            text={upload}
            valid={uploadValue !== null}
            onChange={setUpload}
          />
          <NumberRow
            id="download-limit"
            label="Download limit"
            hint={limitHint}
            text={download}
            valid={downloadValue !== null}
            onChange={setDownload}
          />
          <NumberRow
            id="transfers-at-once"
            label="Transfers at once"
            hint="A whole number from 1 to 8."
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
            Save transfers
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
  return (
    <Section
      id="app-title"
      title="App"
      description="How Tailshare lives on this computer."
    >
      <RadioGroup
        aria-label="Appearance"
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
            label="System"
            htmlFor="theme-system"
            description="Light or dark, whichever Windows uses."
          >
            <RadioGroupItem value="system" id="theme-system" />
          </SettingRow>
          <SettingRow label="Light" htmlFor="theme-light">
            <RadioGroupItem value="light" id="theme-light" />
          </SettingRow>
          <SettingRow label="Dark" htmlFor="theme-dark">
            <RadioGroupItem value="dark" id="theme-dark" />
          </SettingRow>
        </SettingList>
      </RadioGroup>
      <SettingList>
        <SwitchRow
          id="start-with-windows"
          label="Start with Windows"
          description="Opens hidden in the tray when you sign in."
          checked={settings.startWithWindows}
          disabled={saving}
          onChange={(value) => void save({ startWithWindows: value })}
        />
        <SwitchRow
          id="explorer-menu"
          label="Send from Explorer"
          description="Adds Send with Tailshare to the right-click menu for files and folders."
          checked={settings.explorerMenu}
          disabled={saving}
          onChange={(value) => void save({ explorerMenu: value })}
        />
        <SwitchRow
          id="close-to-tray"
          label="Close to tray"
          description="The close button hides the window. Use the tray to quit."
          checked={settings.closeToTray}
          disabled={saving}
          onChange={(value) => void save({ closeToTray: value })}
        />
        <SwitchRow
          id="notifications"
          label="Notifications"
          description="A Windows alert when someone asks to join or a transfer ends, while Tailshare is in the background."
          checked={settings.notifications}
          disabled={saving}
          onChange={(value) => void save({ notifications: value })}
        />
        <SwitchRow
          id="background-effect"
          label="Background effect"
          description="A soft Mica look behind the window. Windows 11 only."
          checked={settings.mica}
          disabled={saving}
          onChange={(value) => void save({ mica: value })}
        />
      </SettingList>
    </Section>
  )
}
