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
import { UpdatesCard } from "./updates-card"
import { useSettings } from "./use-settings"

/** The menu entries, in order. */
const SECTIONS = [
  { id: "you", label: "You" },
  { id: "saving", label: "Saving" },
  { id: "transfers", label: "Transfers" },
  { id: "app", label: "App" },
  { id: "updates", label: "Updates" },
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

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
  const [current, setCurrent] = useState<SectionId>("you")
  const handle = useSettings()
  const { settings, error, saving, save } = handle

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label="Settings sections"
        className="flex w-44 shrink-0 flex-col gap-1 border-r p-3"
      >
        <DialogTitle className="px-2 pt-1 pb-3 text-base font-semibold">
          Settings
        </DialogTitle>
        {SECTIONS.map(({ id, label }) => (
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
        <div className="flex flex-col gap-4 p-6 pr-12">
          <DialogDescription>
            Speed limits, your display name and transfers at once take effect
            from the next update. Tailshare saves them now.
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
              {current === "app" ? (
                <AppSection {...handle} settings={settings} />
              ) : null}
              {current === "updates" ? (
                <UpdatesCard settings={settings} save={save} saving={saving} />
              ) : null}
            </>
          ) : error ? null : (
            <div role="status" aria-busy="true" className="flex flex-col gap-4">
              <span className="sr-only">Loading your settings…</span>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
