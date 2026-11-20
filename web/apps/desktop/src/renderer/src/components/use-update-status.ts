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
