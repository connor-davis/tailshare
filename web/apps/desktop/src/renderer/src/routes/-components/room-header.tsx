import { useEffect } from "react"
import { announce } from "@/components/status-region"
import { Button } from "@/components/ui/button"
import { ShareCode } from "./share-code"
import { CodeCountdown } from "./code-countdown"
import type { PeerInfo } from "@/lib/api/types"
import { useLiveStatus } from "@/lib/live/use-live"

/**
 * The bar over the room: who we are connected to, the share code for the
 * host, and Leave. The column toggles live in the top bar above it.
 */
export function RoomHeader({
  peer,
  onLeave,
  leaving,
  code,
  startedAt = null,
}: {
  /** The other computer; missing while the host waits for someone. */
  peer?: PeerInfo
  /** Leaves the room. */
  onLeave: () => void
  /** True while the leave call is running. */
  leaving: boolean
  /** The code to share again; only the host has one. */
  code?: string
  /** Epoch milliseconds the room opened, for the code countdown. */
  startedAt?: number | null
}) {
  const live = useLiveStatus()
  const reconnecting = live === "reconnecting"

  useEffect(() => {
    if (live === "reconnecting") announce("Reconnecting…")
    else if (live === "open") announce("Connected.")
  }, [live])

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3">
      {peer ? (
        <p className="min-w-0 flex-1 truncate">
          <span className="font-medium" title={peer.displayName}>
            {peer.displayName}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · shares {peer.sharedFolderName}
          </span>
        </p>
      ) : (
        <p className="min-w-0 flex-1 truncate">
          <span className="font-medium">Waiting for someone to join…</span>
          <span className="text-sm text-muted-foreground">
            {" "}
            · <CodeCountdown startedAt={startedAt} />
          </span>
        </p>
      )}
      {code ? <ShareCode code={code} compact /> : null}
      {peer ? (
        <p className="text-sm font-medium">
          {reconnecting ? "Reconnecting…" : "Connected"}
        </p>
      ) : null}
      <Button variant="outline" disabled={leaving} onClick={onLeave}>
        {peer
          ? leaving
            ? "Leaving…"
            : "Leave"
          : leaving
            ? "Cancelling…"
            : "Cancel"}
      </Button>
    </header>
  )
}
