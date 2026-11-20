import { useEffect, useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { SettingsIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useFolder } from "@/lib/api/folder"
import { useSession } from "@/lib/api/session"
import { FolderRow } from "./-components/folder-row"
import { HostCard } from "./-components/host-card"
import { JoinCard } from "./-components/join-card"

/** The connect screen: pick a folder, then host a code or join with one. */
export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { notice?: "left" } =>
    search.notice === "left" ? { notice: "left" } : {},
  component: Connect,
})

function Connect() {
  const { notice } = Route.useSearch()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const { data: folder } = useFolder()
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [ranOut, setRanOut] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const state = session?.state
  const [previous, setPrevious] = useState(state)

  // Adjusted while rendering, so no effect has to set state afterwards.
  // Hosting that ends in idle without a Cancel click means the code ran out.
  if (state !== previous) {
    setPrevious(state)
    if (state === "hosting") {
      setCancelled(false)
      setRanOut(false)
    } else if (previous === "hosting" && state === "idle") {
      setRanOut(!cancelled)
    }
  }

  // Connected means the other computer is there: go to the two panes.
  useEffect(() => {
    if (state === "connected") void navigate({ to: "/session", replace: true })
  }, [state, navigate])

  if (!session || folder === undefined) {
    return (
      <Page>
        <p aria-busy="true" role="status">
          Checking Tailshare…
        </p>
      </Page>
    )
  }

  const idle = session.state === "idle"
  const ready = folder !== null && idle

  return (
    <Page>
      {notice === "left" ? (
        <Alert role="status">
          <AlertDescription>
            The other computer left the session.
          </AlertDescription>
        </Alert>
      ) : null}
      {ranOut ? (
        <Alert role="status">
          <AlertDescription>
            That code ran out. Show a new code.
          </AlertDescription>
        </Alert>
      ) : null}
      <FolderRow name={folder?.name ?? null} canChange={idle} />
      <HostCard
        session={session}
        enabled={ready}
        startedAt={startedAt}
        onHosted={setStartedAt}
        onCancelled={() => setCancelled(true)}
      />
      <JoinCard enabled={ready} connecting={session.state === "connecting"} />
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-4 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tailshare</h1>
        <Button variant="ghost" size="icon" aria-label="Settings" asChild>
          <Link to="/settings">
            <SettingsIcon aria-hidden />
          </Link>
        </Button>
      </header>
      {children}
    </main>
  )
}
