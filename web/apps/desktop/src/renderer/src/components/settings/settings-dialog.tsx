import { useT } from "@/i18n/provider"
import { t } from "../../i18n/index"
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { cn } from "cn"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AppSection,
  SavingSection,
  TransfersSection,
  YouSection,
} from "./settings-fields"
import { ConnectionSection } from "./connection-section"
import { TrustedSection } from "./trusted-section"
import { UpdatesCard } from "./updates-card"
import { useSettings } from "./use-settings"

/** The menu entries, in order. */
const sections = () =>
  [
    { id: "you", label: t("settingsDialog.you") },
    { id: "saving", label: t("settingsDialog.saving") },
    { id: "transfers", label: t("settingsDialog.transfers") },
    { id: "connection", label: t("settingsDialog.connection") },
    { id: "trusted", label: t("settingsDialog.trusted") },
    { id: "app", label: t("settingsDialog.app") },
    { id: "updates", label: t("settingsDialog.updates") },
  ] as const

type SectionId = ReturnType<typeof sections>[number]["id"]

const OpenContext = createContext<() => void>(() => {})

/** Opens the settings dialog. The gear buttons call this. */
export function useOpenSettings(): () => void {
  return useContext(OpenContext)
}

/** Holds the open state and renders the dialog above its children. */
export function SettingsDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const show = useMemo(() => () => setOpen(true), [])

  return (
    <OpenContext.Provider value={show}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="h-[min(36rem,calc(100vh-4rem))] gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <SettingsBody />
        </DialogContent>
      </Dialog>
    </OpenContext.Provider>
  )
}

/** The menu and the chosen section. Mounted only while the dialog is open. */
function SettingsBody() {
  const t = useT()

  const [current, setCurrent] = useState<SectionId>("you")
  const handle = useSettings()
  const { settings, error, saving, save } = handle

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label={t("settingsDialog.settingsSections")}
        className="spaces-rail flex w-28 shrink-0 flex-col gap-1 border-r p-2 sm:w-44 sm:p-3"
      >
        <DialogTitle className="mb-2 border-b border-primary px-2 pt-1 pb-3 text-base font-semibold">
          {t("settingsDialog.settings")}
        </DialogTitle>
        {sections().map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={current === id ? "page" : undefined}
            onClick={() => setCurrent(id)}
            className={cn(
              "rounded-md px-2 py-1.5 text-left text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              current === id && "bg-accent text-accent-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4 pr-10 sm:p-6 sm:pr-12">
          <DialogDescription>
            {t("settingsDialog.speedLimitsYourDisplayNameAndTransfers")}
          </DialogDescription>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {settings ? (
            <>
              {current === "you" ? (
                <YouSection
                  key={settings.displayName}
                  {...handle}
                  settings={settings}
                />
              ) : null}
              {current === "saving" ? (
                <SavingSection {...handle} settings={settings} />
              ) : null}
              {current === "transfers" ? (
                <TransfersSection
                  key={`${settings.uploadLimitKiB}-${settings.downloadLimitKiB}-${settings.transfersAtOnce}`}
                  {...handle}
                  settings={settings}
                />
              ) : null}
              {current === "connection" ? (
                <ConnectionSection {...handle} settings={settings} />
              ) : null}
              {current === "trusted" ? (
                <TrustedSection {...handle} settings={settings} />
              ) : null}
              {current === "app" ? (
                <AppSection {...handle} settings={settings} />
              ) : null}
              {current === "updates" ? (
                <UpdatesCard settings={settings} save={save} saving={saving} />
              ) : null}
            </>
          ) : error ? null : (
            <div role="status" aria-busy="true" className="flex flex-col gap-4">
              <span className="sr-only">
                {t("settingsDialog.loadingYourSettings")}
              </span>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
