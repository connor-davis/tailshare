import { useT } from "@/i18n/provider"
import { useEffect, useRef, useState } from "react"
import { announce } from "@/components/status-region"
import { FolderOpenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "./confirm-dialog"
import { ShareCode } from "./share-code"
import { CodeCountdown } from "./code-countdown"
import { RoomSaveFolder } from "./room-save-folder"
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
  expiresAt = null,
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
  /** When the code stops working, from the sidecar. */
  expiresAt?: string | null
}) {
  const t = useT()

  const live = useLiveStatus()
  const [folderError, setFolderError] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const reconnecting = live === "reconnecting"

  // A room just opened, so the old trigger (a closed dialog or a disabled
  // button) held focus. Move it to the room's name, unless the person has
  // already started typing somewhere. The short wait lets a closing dialog
  // finish first.
  // ponytail: a fixed delay; an onCloseAutoFocus on each dialog would be exact.
  const title = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      const here = document.activeElement
      if (here?.closest("input, textarea, select, [contenteditable]")) return

      title.current?.focus()
    }, 200)

    return () => clearTimeout(timer)
  }, [])

  // The shell already says "Connected." on join, so the first value is skipped.
  const lastLive = useRef(live)
  useEffect(() => {
    if (lastLive.current === live) return

    lastLive.current = live
    if (live === "reconnecting") announce(t("roomHeader.reconnecting"))
    else if (live === "open") announce(t("roomHeader.connected"))
  }, [live, t])

  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b bg-card px-3 py-2">
      {peer ? (
        <p
          ref={title}
          tabIndex={-1}
          className="min-w-40 flex-1 truncate outline-none"
        >
          <span
            className="text-xl font-semibold"
            title={roomName ?? peer.displayName}
          >
            {roomName ?? peer.displayName}
          </span>
        </p>
      ) : (
        <p
          ref={title}
          tabIndex={-1}
          className="min-w-40 flex-1 truncate outline-none"
        >
          {roomName ? (
            <span className="text-xl font-semibold" title={roomName}>
              {roomName}
              <span className="font-normal text-muted-foreground">
                {t("roomHeader.waitingForSomeoneToJoin")}
              </span>
            </span>
          ) : (
            <span className="text-xl font-semibold">
              {t("roomHeader.waitingForSomeoneToJoin2")}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {" "}
            · <CodeCountdown expiresAt={expiresAt} />
          </span>
        </p>
      )}
      {code ? <ShareCode code={code} compact /> : null}
      {peer ? (
        <p className="text-sm font-medium">
          {reconnecting
            ? t("roomHeader.reconnecting")
            : t("roomHeader.connected2")}
        </p>
      ) : null}
      {folderError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("roomHeader.couldNotOpenTheRoomFolderTry")}
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
          {t("roomHeader.openFolder")}
        </Button>
      ) : null}
      {roomCode ? <RoomSaveFolder roomCode={roomCode} /> : null}
      <Button
        variant="outline"
        disabled={leaving}
        // Nobody else is in the room yet, so cancelling costs no one anything.
        onClick={peer ? () => setConfirmingLeave(true) : onLeave}
      >
        {peer
          ? leaving
            ? t("roomHeader.leaving")
            : t("roomHeader.leave")
          : leaving
            ? t("roomHeader.cancelling")
            : t("roomHeader.cancel")}
      </Button>
      <ConfirmDialog
        open={confirmingLeave}
        onOpenChange={setConfirmingLeave}
        title={
          host
            ? t("roomHeader.endThisRoomForEveryone")
            : t("roomHeader.leaveThisRoom")
        }
        description={
          host
            ? t("roomHeader.everyoneIsDisconnectedAndTheCodeStops")
            : t("roomHeader.youCanJoinAgainLaterWithThe")
        }
        confirmLabel={host ? t("roomHeader.endRoom") : t("roomHeader.leave")}
        busyLabel={t("roomHeader.leaving")}
        busy={leaving}
        onConfirm={() => {
          setConfirmingLeave(false)
          onLeave()
        }}
      />
    </header>
  )
}
