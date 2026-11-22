import { useT } from "@/i18n/provider"
import { t } from "../../i18n/index"
import { useEffect, useRef, useState } from "react"
import {
  HistoryIcon,
  LayoutGridIcon,
  LogInIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
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
import { JoinDialog } from "./join-dialog"
import { NameEditor } from "./name-editor"
import { Dot, RailRoomRow } from "./rail-room-row"
import { useRecentRooms } from "./recent-rooms"
import logo from "../../../../../build/logo.svg"

/** What the live room is called in the list. */
function liveName(session: SessionState): string | null {
  if (session.state === "hosting")
    return session.roomName ?? t("roomSidebar.waitingForSomeone")
  if (session.state === "connected" && session.peer)
    return (
      session.roomName ??
      t("roomSidebar.sRoom", { displayName: session.peer.displayName })
    )

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
  onReopen,
  compact = false,
  homeActive = false,
  onHome,
  onOpenRoom,
}: {
  /** Marks Home as the selected surface. */
  homeActive?: boolean
  /** Uses the narrow black rail inside the Spaces shell. */
  compact?: boolean
  /** Opens the home board without leaving the room. */
  onHome?: () => void
  /** Returns to the current room. */
  onOpenRoom?: () => void
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
  /** Hosts a recent room again under its old code. */
  onReopen: (room: { name: string; code: string }) => void
}) {
  const t = useT()

  const rooms = useRecentRooms()
  const openSettings = useOpenSettings()
  const [joining, setJoining] = useState(false)
  const idle = session.state === "idle"
  const [query, setQuery] = useState("")
  const [forgetError, setForgetError] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const joinRef = useRef<HTMLButtonElement>(null)
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

  // When a room ends, its Leave button is gone, so focus goes to Join room.
  // Only when focus is already lost: someone typing elsewhere keeps it.
  const wasIdle = useRef(idle)
  useEffect(() => {
    const ended = idle && !wasIdle.current
    wasIdle.current = idle
    const here = document.activeElement
    if (ended && (!here || here === document.body)) joinRef.current?.focus()
  }, [idle])

  return (
    <aside
      aria-label={t("roomSidebar.rooms")}
      className={`spaces-rail flex h-full min-h-0 flex-col ${compact ? "spaces-rail-compact" : ""}`}
    >
      <DragBar className="gap-2 ps-3 text-xs font-medium">
        <img src={logo} alt="" className="size-4" />
        {t("roomSidebar.tailshare")}
      </DragBar>
      {onHome ? (
        <Button
          className="mx-auto my-2 size-11"
          variant={homeActive ? "default" : "outline"}
          aria-current={homeActive ? "page" : undefined}
          size="icon"
          aria-label={t("roomSidebar.home")}
          onClick={onHome}
        >
          <LayoutGridIcon aria-hidden />
        </Button>
      ) : null}
      {/* T3 shape: search fills the row, the two actions sit beside it. */}
      <div className="flex items-center gap-1.5 px-2 pt-1">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            aria-label={t("roomSidebar.searchRooms")}
            aria-keyshortcuts="Control+K"
            placeholder={t("roomSidebar.searchRooms")}
            autoComplete="off"
            className="ps-8"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("")
            }}
          />
        </div>
        {/* aria-disabled keeps the buttons in Tab order, so the tooltip says why. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("roomSidebar.newRoom")}
              aria-disabled={!canStart}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => {
                if (canStart) onNewRoom()
              }}
            >
              <PlusIcon aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {idle
              ? t("roomSidebar.newRoom")
              : t("roomSidebar.leaveThisRoomToStartAnother")}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              ref={joinRef}
              aria-label={t("roomSidebar.joinRoom")}
              aria-disabled={!canStart}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => {
                if (canStart) setJoining(true)
              }}
            >
              <LogInIcon aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {idle
              ? t("roomSidebar.joinRoom")
              : t("roomSidebar.leaveThisRoomToJoinAnother")}
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
              <Label id="open-room">{t("roomSidebar.rooms")}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-current={!homeActive ? "page" : undefined}
                    aria-label={t(
                      session.role === "host"
                        ? "roomSidebar.openHostRoom"
                        : "roomSidebar.openJoinedRoom",
                      { name: live }
                    )}
                    onClick={onOpenRoom}
                    className="relative flex h-8 items-center gap-2 rounded-md bg-accent px-2 text-accent-foreground before:absolute before:inset-y-1.5 before:start-0 before:w-0.5 before:rounded-full before:bg-primary"
                  >
                    <span aria-hidden className="rail-initial">
                      {Array.from(live)[0]}
                    </span>
                    <Dot live />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="sr-only">
                        {t("roomSidebar.openNow")}
                      </span>
                      <bdi>{live}</bdi>
                    </span>
                    {session.members?.length ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {session.members.length}
                      </span>
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("roomSidebar.currentDescription", {
                    name: live,
                    role:
                      session.role === "host"
                        ? t("common.host")
                        : t("common.joined"),
                  })}
                </TooltipContent>
              </Tooltip>
            </section>
          ) : null}
          <section
            aria-labelledby="recent-rooms"
            className="flex flex-col gap-1"
          >
            <Label id="recent-rooms">{t("roomSidebar.recent")}</Label>
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
                    {needle !== ""
                      ? t("roomSidebar.noRoomsMatch")
                      : t("roomSidebar.noRecentRooms")}
                  </EmptyTitle>
                  <EmptyDescription>
                    {needle !== ""
                      ? t("roomSidebar.tryAnotherNameOrCode")
                      : t("roomSidebar.roomsYouLeaveShowUpHere")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col">
                {shown.map((room) => (
                  <RailRoomRow
                    key={room.code}
                    room={room}
                    idle={idle}
                    canStart={canStart}
                    onRejoin={onRejoin}
                    onReopen={onReopen}
                    onForget={(code) => {
                      setForgetError(false)
                      window.tailshare
                        .removeRecentRoom(code)
                        .catch(() => setForgetError(true))
                    }}
                  />
                ))}
              </ul>
            )}
            {forgetError ? (
              <p role="alert" className="px-2 text-xs text-destructive">
                {t("roomSidebar.couldNotForgetThatRoomTryAgain")}
              </p>
            ) : null}
          </section>
        </div>
      </ScrollArea>
      <footer className="flex items-center gap-1 border-t px-2 py-2">
        <NameEditor />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("roomSidebar.settings")}
          onClick={openSettings}
        >
          <SettingsIcon aria-hidden />
        </Button>
      </footer>
    </aside>
  )
}
