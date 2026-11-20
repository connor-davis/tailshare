import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { SidecarView } from "@/lib/live/use-live"

/** How long the engine may take to start before we say anything. */
const QUIET_START_MS = 2000

/**
 * A thin notice about the sidecar, shown above every route. It says nothing
 * while the engine is fine, and nothing for the first moments of a start.
 */
export function SidecarBanner({ status, error }: SidecarView) {
  const [slowStart, setSlowStart] = useState(false)

  useEffect(() => {
    if (status !== "starting") return

    const timer = setTimeout(() => setSlowStart(true), QUIET_START_MS)

    return () => clearTimeout(timer)
  }, [status])

  const failed = status === "failed"
  let text: string | null = null
  if (failed) text = "Tailshare's engine stopped. Restart Tailshare."
  else if (error) text = error
  else if (status === "restarting") text = "Reconnecting to Tailshare's engine…"
  else if (status === "starting" && slowStart)
    text = "Starting Tailshare's engine…"

  if (!text) return null

  return (
    <Alert
      role={failed || error ? "alert" : "status"}
      variant={failed || error ? "destructive" : "default"}
      className="rounded-none border-x-0 border-t-0"
    >
      <AlertDescription className={failed || error ? "font-medium" : undefined}>
        {text}
      </AlertDescription>
    </Alert>
  )
}
