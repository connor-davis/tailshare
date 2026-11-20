import { useState } from "react"
import { LogInIcon, PlusIcon, SettingsIcon, XIcon } from "lucide-react"
import { useOpenSettings } from "@/components/settings/settings-dialog"
import { DragBar } from "@/components/drag-bar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SessionState } from "@/lib/api/types"
import { formatAgo } from "@/lib/format"
import { FolderRow } from "./folder-row"
import { JoinDialog } from "./join-dialog"
import { NameEditor } from "./name-editor"
import { useRecentRooms } from "./recent-rooms"
import logo from "../../../../../build/logo.svg"

/** What the live room is called in the list. */
function liveName(session: SessionState): string | null {
  if (session.state === "hosting") return "Waiting for someone…"
  if (session.state === "connected" && session.peer)
    return `${session.peer.displayName}'s room`

  return null
}

/** A small muted heading over a group of rows. */
function Label({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="px-2 text-xs font-medium text-muted-foreground">
      {children}
    </h2>
  )
}

/** The dot in front of a room: green while live, muted when only saved. */
function Dot({ live }: { live: boolean }) {
  return (
    <span
      aria-hidden
      className={
        live
          ? "size-2 shrink-0 rounded-full bg-green-500"
          : "size-2 shrink-0 rounded-full bg-muted-foreground/40"
      }
    />
  )
}

/**
 * The left column, full height from the top of the window: logo bar, a quiet
 * New room row, the open room and recent rooms as compact rows, the shared
 * folder, and your name with the settings gear pinned at the bottom.
 */
export function RoomSidebar({
  session,
  folderName,
  busy,
  onNewRoom,
  onJoin,
  onRejoin,
}: {
  /** The current session. */
  session: SessionState
  /** Base name of the shared folder, or null before one is chosen. */
  folderName: string | null
  /** True while a host or join is running, so no second one starts. */
  busy: boolean
  /** Starts a room on this computer. */
  onNewRoom: () => void
  /** Joins a room by its bare code, from the Join dialog. */
  onJoin: (code: string) => void
  /** Joins a recent room again by its bare code. */
  onRejoin: (code: string) => void
}) {
  const rooms = useRecentRooms()
  const openSettings = useOpenSettings()
  const [joining, setJoining] = useState(false)
  const idle = session.state === "idle"
  const live = liveName(session)
  const canStart = idle && !busy
  // ponytail: a rejoin only joins. Reopening a room as its host when nobody
  // answers is later work; it needs a host-by-code call in the sidecar.

  return (
    <aside
      aria-label="Rooms"
      className="flex h-full min-h-0 flex-col border-r bg-card/85"
    >
      <DragBar className="gap-2 pl-3 text-xs font-medium">
        <img src={logo} alt="" className="size-4" />
        Tailshare
      </DragBar>
      <div className="px-2 pt-1">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 px-2"
          disabled={!canStart}
          onClick={onNewRoom}
        >
          <PlusIcon aria-hidden data-icon="inline-start" />
          New room
        </Button>
        {/* A disabled button gets no hover, so the span carries the tooltip. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block" tabIndex={idle ? undefined : 0}>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 px-2"
                disabled={!idle || busy}
                onClick={() => setJoining(true)}
              >
                <LogInIcon aria-hidden data-icon="inline-start" />
                Join room
              </Button>
            </span>
          </TooltipTrigger>
          {idle ? null : (
            <TooltipContent>Leave this room to join another.</TooltipContent>
          )}
        </Tooltip>
      </div>
      <JoinDialog
        open={joining}
        onOpenChange={setJoining}
        enabled={canStart}
        busy={busy}
        folderName={folderName}
        onJoin={onJoin}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-2 py-2">
          {live ? (
            <section
              aria-labelledby="open-room"
              className="flex flex-col gap-1"
            >
              <Label id="open-room">Rooms</Label>
              <p className="relative flex h-8 items-center gap-2 rounded-md bg-accent px-2 text-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary">
                <Dot live />
                <span className="min-w-0 flex-1 truncate">{live}</span>
                {session.members?.length ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {session.members.length}
                  </span>
                ) : null}
              </p>
            </section>
          ) : null}
          <section
            aria-labelledby="recent-rooms"
            className="flex flex-col gap-1"
          >
            <Label id="recent-rooms">Recent</Label>
            {rooms.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">
                No recent rooms yet.
              </p>
            ) : (
              <ul className="flex flex-col">
                {rooms.map((room) => (
                  <li
                    key={room.code}
                    className="group relative flex h-8 items-center rounded-md focus-within:bg-accent/60 hover:bg-accent/60"
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!canStart}
                          aria-label={`Rejoin ${room.name}`}
                          onClick={() => onRejoin(room.code)}
                        >
                          <Dot live={false} />
                          <span className="min-w-0 flex-1 truncate">
                            {room.name}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums group-focus-within:hidden group-hover:hidden">
                            {formatAgo(room.lastSeen)}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{room.name}</TooltipContent>
                    </Tooltip>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="absolute right-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Forget ${room.name}`}
                      onClick={() =>
                        void window.tailshare.removeRecentRoom(room.code)
                      }
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </ScrollArea>
      <div className="px-2 pb-2 text-muted-foreground">
        <FolderRow name={folderName} canChange={idle} />
      </div>
      <footer className="flex items-center gap-1 border-t px-2 py-2">
        <NameEditor />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Settings"
          onClick={openSettings}
        >
          <SettingsIcon aria-hidden />
        </Button>
      </footer>
    </aside>
  )
}
