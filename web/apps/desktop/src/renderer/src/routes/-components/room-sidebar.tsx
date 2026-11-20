import { useEffect, useRef, useState } from "react"
import {
  HistoryIcon,
  LogInIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"
import { useOpenSettings } from "@/components/settings/settings-dialog"
import { DragBar } from "@/components/drag-bar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SessionState } from "@/lib/api/types"
import { formatAgo } from "@/lib/format"
import { JoinDialog } from "./join-dialog"
import { NameEditor } from "./name-editor"
import { useRecentRooms } from "./recent-rooms"
import logo from "../../../../../build/logo.svg"

/** What the live room is called in the list. */
function liveName(session: SessionState): string | null {
  if (session.state === "hosting")
    return session.roomName ?? "Waiting for someone…"
  if (session.state === "connected" && session.peer)
    return session.roomName ?? `${session.peer.displayName}'s room`

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
 * New room row, the open room and recent rooms as compact rows, and your name with the settings gear pinned at the bottom.
 */
export function RoomSidebar({
  session,
  busy,
  onNewRoom,
  onJoin,
  onRejoin,
}: {
  /** The current session. */
  session: SessionState
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
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const needle = query.trim().toLowerCase()
  const matches = (name: string, code?: string) =>
    needle === "" ||
    name.toLowerCase().includes(needle) ||
    (code?.toLowerCase().includes(needle) ?? false)
  const liveLabel = liveName(session)
  const live = liveLabel && matches(liveLabel, session.code) ? liveLabel : null
  const shown = rooms.filter((room) => matches(room.name, room.code))

  // Ctrl+K jumps to the search box from anywhere in the window.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [])
  const canStart = idle && !busy
  // ponytail: a rejoin only joins. Reopening a room as its host when nobody
  // answers is later work; it needs a host-by-code call in the sidecar.

  return (
    <aside
      aria-label="Rooms"
      className="flex h-full min-h-0 flex-col bg-card/85"
    >
      <DragBar className="gap-2 pl-3 text-xs font-medium">
        <img src={logo} alt="" className="size-4" />
        Tailshare
      </DragBar>
      {/* T3 shape: search fills the row, the two actions sit beside it. */}
      <div className="flex items-center gap-1.5 px-2 pt-1">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            aria-label="Search rooms"
            placeholder="Search rooms"
            autoComplete="off"
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("")
            }}
          />
        </div>
        {/* A disabled button gets no hover, so each span carries its tooltip. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={canStart ? undefined : 0}>
              <Button
                variant="outline"
                size="icon"
                aria-label="New room"
                disabled={!canStart}
                onClick={onNewRoom}
              >
                <PlusIcon aria-hidden />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {idle ? "New room" : "Leave this room to start another."}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={idle ? undefined : 0}>
              <Button
                variant="outline"
                size="icon"
                aria-label="Join room"
                disabled={!idle || busy}
                onClick={() => setJoining(true)}
              >
                <LogInIcon aria-hidden />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {idle ? "Join room" : "Leave this room to join another."}
          </TooltipContent>
        </Tooltip>
      </div>
      <JoinDialog
        open={joining}
        onOpenChange={setJoining}
        enabled={canStart}
        busy={busy}
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
            {shown.length === 0 ? (
              <Empty className="flex-none gap-2 p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {needle !== "" ? (
                      <SearchIcon aria-hidden />
                    ) : (
                      <HistoryIcon aria-hidden />
                    )}
                  </EmptyMedia>
                  <EmptyTitle>
                    {needle !== "" ? "No rooms match" : "No recent rooms"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {needle !== ""
                      ? "Try another name or code."
                      : "Rooms you leave show up here."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col">
                {shown.map((room) => (
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
