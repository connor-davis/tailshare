import { useEffect, useState } from "react"
import { announce } from "@/components/status-region"
import { FolderOpenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "./confirm-dialog"
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
  host = false,
  onLeave,
  leaving,
  code,
  roomCode,
  startedAt = null,
}: {
  /** True when this computer is the host, so Leave ends the room for all. */
  host?: boolean
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
  const [folderError, setFolderError] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
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
      {folderError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not open the room folder. Try again.
        </p>
      ) : null}
      {roomCode ? (
        <Button
          variant="outline"
          onClick={() => {
            setFolderError(false)
            window.tailshare
              .openRoomFolder(roomCode)
              .catch(() => setFolderError(true))
          }}
        >
          <FolderOpenIcon aria-hidden data-icon="inline-start" />
          Open folder
        </Button>
      ) : null}
      <Button
        variant="outline"
        disabled={leaving}
        // Nobody else is in the room yet, so cancelling costs no one anything.
        onClick={peer ? () => setConfirmingLeave(true) : onLeave}
      >
        {peer
          ? leaving
            ? "Leaving…"
            : "Leave"
          : leaving
            ? "Cancelling…"
            : "Cancel"}
      </Button>
      <ConfirmDialog
        open={confirmingLeave}
        onOpenChange={setConfirmingLeave}
        title={host ? "End this room for everyone?" : "Leave this room?"}
        description={
          host
            ? "Everyone is disconnected and the code stops working."
            : "You can join again later with the code."
        }
        confirmLabel={host ? "End room" : "Leave"}
        busyLabel="Leaving…"
        busy={leaving}
        onConfirm={() => {
          setConfirmingLeave(false)
          onLeave()
        }}
      />
    </header>
  )
}
