import { useEffect, useState } from "react"
import type { UpdateStatus } from "../../../shared/bridge"

/** Follows update events, keeping a late initial read from replacing newer state. */
export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let alive = true
    let receivedEvent = false
    const unsubscribe = window.tailshare.onUpdateStatus((next) => {
      receivedEvent = true
      if (alive) setStatus(next)
    })
    window.tailshare
      .getUpdateStatus()
      .then((current) => {
        if (alive && !receivedEvent) setStatus(current)
      })
      .catch(() => {
        if (alive)
          setError(
            "Could not check for updates. Reopen Tailshare to try again."
          )
      })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return { status, error }
}

/**
 * Download and restart for an update, shared by the top bar and Settings.
 * `pending` names the action in flight; a successful restart quits the app,
 * so it stays pending.
 */
export function useUpdateActions() {
  const [pending, setPending] = useState<"download" | "restart" | null>(null)
  const [error, setError] = useState("")

  async function download() {
    setPending("download")
    setError("")

    try {
      await window.tailshare.downloadUpdate()
    } catch {
      setError("Could not download the update. Try again.")
    } finally {
      setPending(null)
    }
  }

  async function restart() {
    setPending("restart")
    setError("")

    try {
      await window.tailshare.restartToUpdate()
    } catch {
      setError("Could not restart to update. Try again.")
      setPending(null)
    }
  }

  return { pending, error, download, restart }
}
