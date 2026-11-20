import { createFileRoute, useRouter } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AppSection,
  SavingSection,
  TransfersSection,
  YouSection,
} from "./settings/-components/settings-fields"
import { UpdatesCard } from "./settings/-components/updates-card"
import { useSettings } from "./settings/-components/use-settings"

/** Settings: your name, where files land, limits, the app and updates. */
export const Route = createFileRoute("/settings")({ component: Settings })

function Settings() {
  const router = useRouter()
  const handle = useSettings()
  const { settings, error, saving, save } = handle

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-8">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={() => router.history.back()}
        >
          <ArrowLeftIcon aria-hidden />
        </Button>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

      <Alert role="note">
        <AlertDescription>
          Speed limits, your display name and transfers at once take effect from
          the next update. Tailshare saves them now.
        </AlertDescription>
      </Alert>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {settings ? (
        <>
          <YouSection
            key={settings.displayName}
            {...handle}
            settings={settings}
          />
          <SavingSection {...handle} settings={settings} />
          <TransfersSection
            key={`${settings.uploadLimitKiB}-${settings.downloadLimitKiB}-${settings.transfersAtOnce}`}
            {...handle}
            settings={settings}
          />
          <AppSection {...handle} settings={settings} />
          <UpdatesCard settings={settings} save={save} saving={saving} />
        </>
      ) : error ? null : (
        <div role="status" aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">Loading your settings…</span>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
    </main>
  )
}
