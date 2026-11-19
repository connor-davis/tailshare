import { useEffect, useState } from "react"
import { useQuery, useQueryClient, skipToken } from "@tanstack/react-query"
import type { SidecarStatus } from "../../../../shared/bridge"
import { ApiError, getConnection, resetConnection } from "../api/client"
import { keys } from "../api/keys"
import { LiveSocket, type LiveStatus } from "./socket"

/** What the banner needs to know about the sidecar. */
export interface SidecarView {
  /** Latest status from the desktop shell. */
  status: SidecarStatus
  /** A plain sentence when the connection details could not be read. */
  error: string | null
}

/**
 * Start the live socket and keep it in step with the sidecar. After a restart
 * the token is new, so the connection is read again and the caches reset.
 * Call it once, from the root route.
 */
export function useLive(): SidecarView {
  const client = useQueryClient()
  const [status, setStatus] = useState<SidecarStatus>("starting")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let socket: LiveSocket | null = null
    let generation = 0

    const stopSocket = () => {
      socket?.stop()
      socket = null
    }

    const connect = async () => {
      const mine = ++generation
      stopSocket()
      resetConnection()
      void client.resetQueries()

      try {
        const info = await getConnection()
        // A newer connect or a cleanup came first; this answer is stale.
        if (mine !== generation) return

        setError(null)
        setStatus("ready")
        socket = new LiveSocket(info, client, {
          onStatus: (live) => client.setQueryData(keys.live, live),
        })
        socket.start()
      } catch (reason) {
        if (mine !== generation) return
        setError(
          reason instanceof ApiError
            ? reason.message
            : "Tailshare is not responding."
        )
      }
    }

    const unsubscribe = window.tailshare.onSidecarStatus((next) => {
      setStatus(next)
      if (next === "ready") {
        void connect()
      } else if (next === "restarting" || next === "failed") {
        generation++
        stopSocket()
      }
    })

    void connect()

    return () => {
      generation++
      unsubscribe()
      stopSocket()
    }
  }, [client])

  return { status, error }
}

/** Whether the live socket is up. `undefined` until the first snapshot. */
export function useLiveStatus(): LiveStatus | undefined {
  const { data } = useQuery<LiveStatus>({
    queryKey: keys.live,
    queryFn: skipToken,
    staleTime: Infinity,
  })

  return data
}
