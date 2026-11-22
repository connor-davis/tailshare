import { useT } from "@/i18n/provider"
import { useRef, useState, type ReactNode } from "react"
import { Maximize2Icon, Minimize2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { PeerInfo, SessionState } from "@/lib/api/types"
import { AppsPanel } from "./apps-panel"
import { MembersPanel } from "./members-panel"
import { RoomChat } from "./room-chat"
import { RoomFiles } from "./room-files"
import { RoomHeader } from "./room-header"
import { FolderBrowseContext, type BrowseFolder } from "./folder-browse-context"
import { RoomFolderBrowser } from "./room-folder-browser"
import { TransfersPanel } from "./transfers-panel"

const tileKeys = {
  Files: "roomView.files",
  People: "roomView.people",
  Chat: "roomView.chat",
  Transfers: "roomView.transfers",
  Apps: "roomView.apps",
} as const

type Tile = "Files" | "People" | "Chat" | "Transfers" | "Apps"

/** The five-tile room board keeps each owner mounted while a tile is expanded. */
export function RoomView({
  session,
  peer,
  roomName,
  host,
  onLeave,
  leaving,
  code,
  roomCode,
  expiresAt,
}: {
  /** Live membership and approval state. */
  session: SessionState
  /** True when this computer is the host. */
  host?: boolean
  /** The other computer; missing while the host waits for someone. */
  peer?: PeerInfo
  /** The host's name for the room, for the header. */
  roomName?: string
  /** Leaves the room. */
  onLeave: () => void
  /** True while the leave call is running. */
  leaving: boolean
  /** The code to share again; only the host has one. */
  code?: string
  /** The room's own code, host or joiner, for Open folder. */
  roomCode?: string
  /** When the code stops working, from the sidecar. */
  expiresAt?: string | null
}) {
  const t = useT()

  const [expanded, setExpanded] = useState<Tile | null>(null)

  const [folder, setFolder] = useState<BrowseFolder | null>(null)
  // Closing the folder view removes the button that had focus; the Files
  // expand button is the nearest place to land.
  const filesExpand = useRef<HTMLButtonElement>(null)

  const connected = peer !== undefined

  const tile = (name: Tile, children: ReactNode) => (
    <Card
      key={name}
      hidden={!!expanded && expanded !== name}
      role="region"
      aria-labelledby={`tile-${name}`}
      className={`spaces-tile spaces-tile-${name.toLowerCase()} gap-0 overflow-hidden py-0 ${expanded && expanded !== name ? "hidden" : ""}`}
    >
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <span aria-hidden className="size-2.5 shrink-0 bg-primary" />
        <h2
          id={`tile-${name}`}
          className="mr-auto text-xs font-extrabold tracking-widest uppercase"
        >
          {t(tileKeys[name])}
        </h2>
        {name === "People" && session.role === "host" && session.join ? (
          <Badge variant="secondary" className="whitespace-normal">
            {t("roomView.someoneWantsToJoin")}
          </Badge>
        ) : null}
        <Button
          ref={name === "Files" ? filesExpand : undefined}
          variant="ghost"
          size="icon-sm"
          aria-label={
            expanded === name
              ? t("roomView.returnToRoomBoard")
              : t("roomView.expand", { name: t(tileKeys[name]) })
          }
          aria-expanded={expanded === name}
          onClick={() => setExpanded(expanded === name ? null : name)}
        >
          {expanded === name ? (
            <Minimize2Icon aria-hidden />
          ) : (
            <Maximize2Icon aria-hidden />
          )}
        </Button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </Card>
  )

  return (
    <FolderBrowseContext
      value={(next) => {
        setFolder(next)
        setExpanded("Files")
      }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <RoomHeader
          peer={peer}
          roomName={roomName}
          host={host}
          onLeave={onLeave}
          leaving={leaving}
          code={code}
          roomCode={roomCode}
          expiresAt={expiresAt}
        />
        {/* People may be below the fold or hidden by another expanded tile. */}
        {session.role === "host" && session.join && expanded !== "People" ? (
          <div className="flex flex-wrap items-center gap-3 border-b bg-card px-3 py-2">
            <p className="mr-auto">{t("roomView.someoneWantsToJoin2")}</p>
            <Button
              variant="outline"
              onClick={() => {
                setExpanded("People")
              }}
            >
              {t("roomView.reviewJoinRequest")}
            </Button>
          </div>
        ) : null}
        <ScrollArea className="min-h-0 flex-1">
          <div
            className={`spaces-board ${expanded ? "spaces-board-expanded" : ""}`}
          >
            {tile(
              "Files",
              folder ? (
                <RoomFolderBrowser
                  folder={folder}
                  onClose={() => {
                    setFolder(null)
                    filesExpand.current?.focus()
                  }}
                />
              ) : (
                <RoomFiles connected={connected} />
              )
            )}
            {tile("People", <MembersPanel session={session} embedded />)}
            {tile("Chat", <RoomChat connected={connected} />)}
            {tile("Transfers", <TransfersPanel />)}
            {tile("Apps", <AppsPanel connected={connected} />)}
          </div>
        </ScrollArea>
      </div>
    </FolderBrowseContext>
  )
}
