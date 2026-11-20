import { useEffect, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useSettings } from "@/components/settings/use-settings"
import { announce } from "@/components/status-region"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useChooseFolder, useFolder } from "@/lib/api/folder"
import { useHost, useJoin, useLeave, useSession } from "@/lib/api/session"
import { EmptyState } from "./-components/empty-state"
import { MembersPanel } from "./-components/members-panel"
import { MainBar } from "./-components/main-bar"
import { usePanelLayout, usePanelOpen } from "./-components/panel-layout"
import { rememberRoom } from "./-components/recent-rooms"
import { RoomSidebar } from "./-components/room-sidebar"
import { RoomView } from "./-components/room-view"

/**
 * The app shell: rooms on the left, the room in the middle, members on the
 * right. Today there is one room at a time.
 */
export const Route = createFileRoute("/")({ component: Shell })

function Shell() {
  const { data: session } = useSession()
  const { data: folder } = useFolder()
  const { settings } = useSettings()
  const host = useHost()
  const join = useJoin()
  const leave = useLeave()
  const choose = useChooseFolder()
  const [roomsOpen, toggleRooms] = usePanelOpen("rooms")
  const [membersOpen, toggleMembers] = usePanelOpen("members")
  // Each mix of shown columns keeps its own saved sizes.
  const layout = usePanelLayout("app", [
    ...(roomsOpen ? ["rooms"] : []),
    "content",
    ...(membersOpen ? ["members"] : []),
  ])
  const [startedAt, setStartedAt] = useState<number | null>(null)
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

  // Adjusted while rendering, so no effect has to set state afterwards.
  // Ending without our own click means the code ran out or the other side left.
  if (state !== previous) {
    setPrevious(state)
    if (state === "hosting" || state === "connected") {
      setOwnEnd(false)
      setNotice(null)
    } else if (state === "idle" && !ownEnd) {
      if (previous === "hosting")
        setNotice("That code ran out. Show a new code.")
      if (previous === "connected")
        setNotice("The other computer left the room.")
    }
  }

  // No folder yet: ask for one first, then carry on. Cancelling does nothing.
  const withFolder = (go: () => void) => {
    if (folder) go()
    else choose.mutate(undefined, { onSuccess: (picked) => picked && go() })
  }

  const joinNow = (code: string) =>
    join.mutate(code, {
      onSuccess: (next) => {
        announce("Connected.")
        rememberRoom(next.peer?.displayName, code)
      },
    })

  const joinCode = (code: string) => withFolder(() => joinNow(code))

  // A tailshare:// link joins as if its code were typed. Kept in a ref so the
  // subscription is made once but always calls the newest handler.
  const onLink = useRef((code: string) => joinCode(code))
  useEffect(() => {
    onLink.current = (code) => {
      if (state === "idle") joinCode(code)
      else announce("Leave the open room first.", "assertive")
    }
  })
  useEffect(
    () => window.tailshare.onJoinLink((code) => onLink.current(code)),
    []
  )

  // A new room goes in the recent list the moment it has a code.
  const code = session?.state === "hosting" ? session.code : undefined
  useEffect(() => {
    if (code) rememberRoom(settings?.displayName, code)
  }, [code, settings?.displayName])

  if (!session || folder === undefined) {
    return (
      <p aria-busy="true" role="status" className="p-8">
        Checking Tailshare…
      </p>
    )
  }

  const idle = session.state === "idle"
  const ready = idle
  const busy =
    host.isPending || join.isPending || session.state === "connecting"
  const error = host.error ?? join.error ?? leave.error
  const createRoom = () =>
    withFolder(() =>
      host.mutate(undefined, { onSuccess: () => setStartedAt(Date.now()) })
    )
  const leaveRoom = () => {
    setOwnEnd(true)
    leave.mutate(undefined, { onError: () => setOwnEnd(false) })
  }

  let content = (
    <EmptyState
      enabled={ready}
      busy={busy}
      folderName={folder?.name ?? null}
      onCreate={createRoom}
      onJoin={joinCode}
    />
  )
  // Hosting goes straight into the room: the other side just has no peer yet.
  if (
    session.state === "hosting" ||
    (session.state === "connected" && session.peer)
  ) {
    content = (
      <RoomView
        peer={session.peer}
        leaving={leave.isPending}
        code={
          session.role === "host"
            ? (session.code ?? hostCode ?? undefined)
            : undefined
        }
        startedAt={startedAt}
        onLeave={leaveRoom}
      />
    )
  }

  return (
    <main className="h-full min-h-0">
      <ResizablePanelGroup
        key={`${roomsOpen}-${membersOpen}`}
        id="app"
        orientation="horizontal"
        {...layout}
      >
        {roomsOpen ? (
          <>
            <ResizablePanel
              id="rooms"
              defaultSize={260}
              minSize={200}
              maxSize="50%"
            >
              <RoomSidebar
                session={session}
                folderName={folder?.name ?? null}
                busy={busy}
                onNewRoom={createRoom}
                onJoin={joinCode}
                onRejoin={joinCode}
              />
            </ResizablePanel>
            <ResizableHandle />
          </>
        ) : null}
        <ResizablePanel id="content" minSize={400}>
          <div className="flex h-full min-h-0 flex-col">
            <MainBar
              roomsOpen={roomsOpen}
              onToggleRooms={toggleRooms}
              membersOpen={membersOpen}
              onToggleMembers={toggleMembers}
            />
            {notice || error ? (
              <Alert
                role="status"
                variant={notice ? "default" : "destructive"}
                className="rounded-none border-x-0 border-t-0"
              >
                <AlertDescription>{notice ?? error?.message}</AlertDescription>
              </Alert>
            ) : null}
            <div className="min-h-0 flex-1">{content}</div>
          </div>
        </ResizablePanel>
        {membersOpen ? (
          <>
            <ResizableHandle />
            <ResizablePanel
              id="members"
              defaultSize={240}
              minSize={200}
              maxSize="40%"
            >
              <MembersPanel session={session} />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </main>
  )
}
