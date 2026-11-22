import { useT } from "@/i18n/provider"
import { foldCode } from "@/lib/code-input"
import { useEffect, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useSettings } from "@/components/settings/use-settings"
import { announce } from "@/components/status-region"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  useHost,
  useJoin,
  useLeave,
  useSession,
  useRooms,
  useActivateRoom,
} from "@/lib/api/session"
import { HomeBoard } from "./-components/home-board"
import { DownloadsAlert } from "./-components/downloads-alert"
import { MainBar } from "./-components/main-bar"
import { usePanelOpen } from "./-components/panel-layout"
import { rememberRoom } from "./-components/recent-rooms"
import { NewRoomDialog } from "./-components/new-room-dialog"
import { RoomSidebar } from "./-components/room-sidebar"
import { RoomView } from "./-components/room-view"

/**
 * The Spaces shell: black room rail, home cards and the active room board.
 */
export const Route = createFileRoute("/")({ component: Shell })

const noop = () => {}

function Shell() {
  const t = useT()

  const { data: session } = useSession()
  const { data: rooms } = useRooms()
  const activate = useActivateRoom()
  const selectRoom = (code: string) =>
    activate.mutate(code, { onSuccess: () => setHome(false) })
  const { settings } = useSettings()
  const host = useHost(settings?.displayName)
  const join = useJoin(settings?.displayName)
  const leave = useLeave()
  // The open room, saved to the recent list once this computer is out of it.
  const openRoom = useRef<{ roomName?: string; code: string } | null>(null)
  const [home, setHome] = useState(false)
  const [naming, setNaming] = useState(false)
  const [roomsOpen, toggleRooms] = usePanelOpen("rooms")
  // True once this computer ended the room itself, so no notice shows.
  const [ownEnd, setOwnEnd] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const state = session?.state
  const [previous, setPrevious] = useState(state)
  // The code is cleared once someone joins, but the host may still want to
  // send it again, so it is kept until the room ends.
  const [hostCode, setHostCode] = useState<string | null>(null)
  if (session?.code && session.code !== hostCode) setHostCode(session.code)
  else if (state === "idle" && hostCode) setHostCode(null)
  // A joiner has no code in the session, so keep the one they typed. Open
  // folder needs it to find the room's folder.
  const [joinedCode, setJoinedCode] = useState<string | null>(null)
  if (state === "idle" && joinedCode) setJoinedCode(null)

  // Adjusted while rendering, so no effect has to set state afterwards.
  // Ending without our own click means the code ran out or the other side left.
  if (state !== previous) {
    setPrevious(state)
    if (state === "hosting" || state === "connected") {
      setOwnEnd(false)
      setNotice(null)
    } else if (state === "idle" && !ownEnd) {
      if (previous === "hosting") setNotice(t("index.thatCodeRanOutShowANew"))
      if (previous === "connected")
        setNotice(t("index.theOtherComputerLeftTheRoom"))
    }
  }

  const joinCode = (code: string) =>
    join.mutate(code, {
      onSuccess: (next) => {
        setHome(false)
        announce(t("index.connected"))
        setJoinedCode(code)
        openRoom.current = { roomName: next.roomName, code }
      },
    })

  // A tailshare:// link joins as if its code were typed. Kept in a ref so the
  // subscription is made once but always calls the newest handler. Until the
  // session is known, "idle" cannot be told from "busy", so the link waits.
  const knownRooms = useRef<Map<string, string | undefined> | null>(null)
  useEffect(() => {
    if (!rooms) return
    const next = new Map(
      rooms.rooms
        .filter((room) => room.room)
        .map((room) => [room.room!, room.roomName])
    )
    for (const [code, name] of knownRooms.current ?? []) {
      if (!next.has(code)) rememberRoom(name, code)
    }
    knownRooms.current = next
  }, [rooms])

  const pendingLink = useRef<string | null>(null)
  const onLink = useRef((code: string) => joinCode(code))
  useEffect(() => {
    onLink.current = (code) => {
      if (state === undefined) pendingLink.current = code
      else if (
        rooms?.rooms.some(
          (room) => foldCode(room.room ?? "") === foldCode(code)
        )
      )
        selectRoom(code)
      else joinCode(code)
    }
  })
  useEffect(
    () => window.tailshare.onJoinLink((code) => onLink.current(code)),
    []
  )
  useEffect(() => {
    const code = pendingLink.current
    if (!state || !code) return

    pendingLink.current = null
    onLink.current(code)
  }, [state])

  // The open room joins the recent list only once this computer is out of
  // it, however it ended: Leave, the code running out or the other side going.
  const code = session?.state === "hosting" ? session.code : undefined
  const roomName = session?.roomName
  useEffect(() => {
    if (code) openRoom.current = { roomName, code }
  }, [code, roomName])

  // Main keeps the room's code for as long as it runs, so a reloaded page can
  // get its folder and share controls back. The sidecar never repeats the code.
  const roomCodeNow =
    session?.room ??
    (session?.role === "host" ? (code ?? hostCode) : joinedCode)
  useEffect(() => {
    if (state === "idle") void window.tailshare.setCurrentRoom(null).catch(noop)
    else if (state && roomCodeNow)
      void window.tailshare
        .setCurrentRoom({ name: roomName ?? "", code: roomCodeNow })
        .catch(noop)
  }, [state, roomCodeNow, roomName])
  const role = session?.role
  const restored = useRef(false)
  useEffect(() => {
    if (session?.room || restored.current || !state || state === "idle") return

    restored.current = true
    void window.tailshare
      .getCurrentRoom()
      .then((room) => {
        if (!room) return
        if (role === "host") setHostCode((now) => now ?? room.code)
        else setJoinedCode((now) => now ?? room.code)
        openRoom.current ??= {
          roomName: room.name || undefined,
          code: room.code,
        }
      })
      .catch(noop)
  }, [state, role, session?.room])

  // Requests need an announcement even while another tile or Home is open.
  const joinWaiting = session?.role === "host" && !!session.join
  const joinId = joinWaiting ? session?.join?.id : undefined
  useEffect(() => {
    if (joinId !== undefined)
      announce(t("index.someoneWantsToJoinOpenPeopleTo"), "assertive")
  }, [joinId, t])

  // The notice bar appears already filled, which screen readers can miss.
  useEffect(() => {
    if (notice) announce(notice)
  }, [notice])

  // Say who came and went. The first list is silent: it is only the room as
  // it already was.
  const members = session?.members
  const knownMembers = useRef<Map<string, string> | null>(null)
  const knownRoom = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!members || (state !== "hosting" && state !== "connected")) {
      knownMembers.current = null
      return
    }

    const now = new Map(
      members.filter((member) => !member.you).map((m) => [m.id, m.displayName])
    )
    const before =
      knownRoom.current === session?.room ? knownMembers.current : null
    knownRoom.current = session?.room
    knownMembers.current = now
    if (!before) return

    for (const [id, name] of now)
      if (!before.has(id)) announce(t("index.joined", { name: name }))
    for (const [id, name] of before)
      if (!now.has(id)) announce(t("index.left", { name: name }))
  }, [members, state, t, session?.room])

  useEffect(() => {
    if (state !== "idle" || !openRoom.current) return
    rememberRoom(openRoom.current.roomName, openRoom.current.code)
    openRoom.current = null
  }, [state])

  if (!session) {
    return (
      <p aria-busy="true" role="status" className="p-8">
        {t("index.checkingTailshare")}
      </p>
    )
  }

  const busy =
    host.isPending || join.isPending || session.state === "connecting"
  const error = host.error ?? join.error ?? leave.error ?? activate.error
  const createRoom = (name: string) =>
    host.mutate(name, {
      onSuccess: () => setHome(false),
    })
  // Reopens a saved room as its host: same code, same name, and every join
  // still needs Allow.
  const reopenRoom = (room: { name: string; code: string }) =>
    host.mutate(
      { roomName: room.name, code: room.code },
      { onSuccess: () => setHome(false) }
    )
  const leaveRoom = () => {
    const hosting = session.role === "host"
    setOwnEnd(true)
    leave.mutate(session.room, {
      onSuccess: () =>
        announce(hosting ? t("index.roomEnded") : t("index.youLeftTheRoom")),
      onError: () => setOwnEnd(false),
    })
  }

  const showHome = home && !joinWaiting
  const active =
    session.state === "hosting" ||
    (session.state === "connected" && !!session.peer)

  return (
    <main className="h-full min-h-0">
      <NewRoomDialog
        open={naming}
        onOpenChange={setNaming}
        defaultName={t("index.defaultRoomName", {
          owner: settings?.displayName ?? t("common.my"),
        }).slice(0, 64)}
        busy={busy}
        onCreate={createRoom}
      />
      <div className="flex h-full min-h-0">
        {roomsOpen ? (
          <div className="w-[72px] shrink-0">
            <RoomSidebar
              compact
              homeActive={!active || showHome}
              session={session}
              openRooms={rooms?.rooms}
              onSelectRoom={selectRoom}
              busy={busy}
              onHome={() => setHome(true)}
              onOpenRoom={() => setHome(false)}
              onNewRoom={() => setNaming(true)}
              onJoin={joinCode}
              onRejoin={joinCode}
              onReopen={reopenRoom}
            />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <MainBar roomsOpen={roomsOpen} onToggleRooms={toggleRooms} />
          <DownloadsAlert />
          {notice || error ? (
            <Alert
              role={notice ? "status" : "alert"}
              variant={notice ? "default" : "destructive"}
              className="rounded-none border-x-0 border-t-0"
            >
              <AlertDescription>{notice ?? error?.message}</AlertDescription>
            </Alert>
          ) : null}
          <div
            hidden={active && !showHome}
            className={`min-h-0 flex-1 ${active && !showHome ? "hidden" : ""}`}
          >
            <HomeBoard
              openRooms={rooms?.rooms}
              session={session}
              busy={busy}
              onCreate={() => setNaming(true)}
              onJoin={joinCode}
              onReopen={reopenRoom}
              onOpenRoom={() => setHome(false)}
            />
          </div>
          {active ? (
            <div
              hidden={showHome}
              className={`min-h-0 flex-1 ${showHome ? "hidden" : ""}`}
            >
              <RoomView
                key={session.room}
                session={session}
                peer={session.peer}
                roomName={session.roomName}
                host={session.role === "host"}
                leaving={leave.isPending}
                code={
                  session.role === "host"
                    ? (session.room ?? session.code ?? hostCode ?? undefined)
                    : undefined
                }
                roomCode={
                  session.role === "host"
                    ? (session.room ?? session.code ?? hostCode ?? undefined)
                    : (session.room ?? joinedCode ?? undefined)
                }
                expiresAt={session.expiresAt}
                onLeave={leaveRoom}
              />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
