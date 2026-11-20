import { useEffect } from "react"
import { announce } from "@/components/status-region"
import { FolderOpenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ShareCode } from "./share-code"
import { CodeCountdown } from "./code-countdown"
import type { PeerInfo } from "@/lib/api/types"
import { useLiveStatus } from "@/lib/live/use-live"

/**
 * The bar over the room: who we are connected to, the share code for the
 * host, Open folder and Leave. The column toggles live in the top bar above it.
 */
export function RoomHeader({
  peer,
  roomName,
  onLeave,
  leaving,
  code,
  roomCode,
  startedAt = null,
}: {
  /** The other computer; missing while the host waits for someone. */
  peer?: PeerInfo
  /** The host's name for the room. Falls back to the other computer's name. */
  roomName?: string
  /** Leaves the room. */
  onLeave: () => void
  /** True while the leave call is running. */
  leaving: boolean
  /** The code to share again; only the host has one. */
  code?: string
  /** The room's own code, host or joiner, for finding its folder. */
  roomCode?: string
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
          <span className="font-medium" title={roomName ?? peer.displayName}>
            {roomName ?? peer.displayName}
          </span>
        </p>
      ) : (
        <p className="min-w-0 flex-1 truncate">
          {roomName ? (
            <span className="font-medium" title={roomName}>
              {roomName}
              <span className="font-normal text-muted-foreground">
                {" "}
                · Waiting for someone to join…
              </span>
            </span>
          ) : (
            <span className="font-medium">Waiting for someone to join…</span>
          )}
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
      {roomCode ? (
        <Button
          variant="outline"
          onClick={() => void window.tailshare.openRoomFolder(roomCode)}
        >
          <FolderOpenIcon aria-hidden data-icon="inline-start" />
          Open folder
        </Button>
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
