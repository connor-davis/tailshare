import { useState, type ReactNode } from "react"
import { FolderIcon } from "lucide-react"
import type { Settings } from "../../../../../shared/bridge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SettingsHandle } from "./use-settings"

/** The biggest speed limit main accepts, in KiB per second. */
const MAX_LIMIT_KIB = 1048576

/** What every section gets: the loaded settings and the way to save them. */
type SectionProps = SettingsHandle & { settings: Settings }

/** A titled card, so every section looks the same. */
function Section({
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
  /** The fields. */
  children: ReactNode
}) {
  return (
    <Card
      role="region"
      aria-labelledby={id}
      className="rounded-lg border ring-0"
    >
      <CardHeader>
        <CardTitle id={id} role="heading" aria-level={2}>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void save({ displayName: name.trim() })
        }}
      >
        <Field>
          <FieldLabel htmlFor="display-name">Display name</FieldLabel>
          <Input
            id="display-name"
            value={name}
            maxLength={64}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
          <FieldDescription>
            Up to 64 characters. Leave it empty to use this computer&apos;s
            name.
          </FieldDescription>
        </Field>
        <div>
          <Button
            type="submit"
            disabled={saving || name.trim() === settings.displayName}
          >
            Save name
          </Button>
        </div>
      </form>
    </Section>
  )
}

/** Where downloads go: a folder, or a question every time. */
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
      <FieldGroup>
        <RadioGroup
          aria-label="When a file arrives"
          value={settings.saveMode}
          disabled={saving}
          onValueChange={(value) => {
            if (value === "folder" || value === "ask")
              void save({ saveMode: value })
          }}
        >
          <Field orientation="horizontal">
            <RadioGroupItem value="folder" id="save-folder-mode" />
            <FieldLabel htmlFor="save-folder-mode">Save to folder</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem value="ask" id="save-ask-mode" />
            <FieldLabel htmlFor="save-ask-mode">Ask every time</FieldLabel>
          </Field>
        </RadioGroup>
        {settings.saveMode === "folder" ? (
          <Field>
            <FieldLabel id="save-folder-label">Save folder</FieldLabel>
            <div className="flex items-center gap-3">
              <FolderIcon aria-hidden className="size-4 shrink-0" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <p
                    aria-labelledby="save-folder-label"
                    tabIndex={0}
                    className="min-w-0 flex-1 truncate"
                  >
                    {settings.saveFolder}
                  </p>
                </TooltipTrigger>
                <TooltipContent>{settings.saveFolder}</TooltipContent>
              </Tooltip>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => void change()}
              >
                Change
              </Button>
            </div>
          </Field>
        ) : null}
      </FieldGroup>
    </Section>
  )
}

/** One whole number from a text box, or null if it is not one in range. */
function wholeNumber(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const value = Number(text)

  return value >= min && value <= max ? value : null
}

/** A number box with its hint, or its error when the value is out of range. */
function NumberField({
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
  /** The rule, in plain words. Becomes the error when the value is bad. */
  hint: string
  /** What is typed. */
  text: string
  /** False when the text is not an allowed number. */
  valid: boolean
  /** Called with the typed text. */
  onChange: (text: string) => void
}) {
  return (
    <Field data-invalid={!valid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode="numeric"
        value={text}
        aria-invalid={!valid}
        onChange={(event) => onChange(event.target.value)}
      />
      {valid ? (
        <FieldDescription>{hint}</FieldDescription>
      ) : (
        <FieldError>{hint}</FieldError>
      )}
    </Field>
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
        className="flex flex-col gap-3"
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
        <FieldGroup>
          <NumberField
            id="upload-limit"
            label="Upload limit"
            hint={limitHint}
            text={upload}
            valid={uploadValue !== null}
            onChange={setUpload}
          />
          <NumberField
            id="download-limit"
            label="Download limit"
            hint={limitHint}
            text={download}
            valid={downloadValue !== null}
            onChange={setDownload}
          />
          <NumberField
            id="transfers-at-once"
            label="Transfers at once"
            hint="A whole number from 1 to 8."
            text={slots}
            valid={slotsValue !== null}
            onChange={setSlots}
          />
        </FieldGroup>
        <div>
          <Button
            type="submit"
            disabled={
              saving ||
              !changed ||
              uploadValue === null ||
              downloadValue === null ||
              slotsValue === null
            }
          >
            Save transfers
          </Button>
        </div>
      </form>
    </Section>
  )
}

/** One switch with its words, saved the moment it flips. */
function SwitchField({
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
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </Field>
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
      <FieldSet>
        <FieldLegend variant="label" className="sr-only">
          App options
        </FieldLegend>
        <FieldGroup>
          <SwitchField
            id="start-with-windows"
            label="Start with Windows"
            description="Opens hidden in the tray when you sign in."
            checked={settings.startWithWindows}
            disabled={saving}
            onChange={(value) => void save({ startWithWindows: value })}
          />
          <SwitchField
            id="close-to-tray"
            label="Close to tray"
            description="The close button hides the window. Use the tray to quit."
            checked={settings.closeToTray}
            disabled={saving}
            onChange={(value) => void save({ closeToTray: value })}
          />
          <SwitchField
            id="background-effect"
            label="Background effect"
            description="A soft Mica look behind the window. Windows 11 only."
            checked={settings.mica}
            disabled={saving}
            onChange={(value) => void save({ mica: value })}
          />
        </FieldGroup>
      </FieldSet>
    </Section>
  )
}
