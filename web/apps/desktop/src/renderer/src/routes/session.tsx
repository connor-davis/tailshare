import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useFolder } from "@/lib/api/folder"
import { useLeave, useSession } from "@/lib/api/session"
import { joinPath, useStartTransfer } from "@/lib/api/transfers"
import type { Side } from "@/lib/api/types"
import { ChatSheet } from "./session/-components/chat-sheet"
import { FilePane } from "./session/-components/file-pane"
import { SessionBar } from "./session/-components/session-bar"
import { TransferDock } from "./session/-components/transfer-dock"
import type { RowsPayload } from "./session/-components/use-pane-drag"

/** The two panes, the transfer dock and the chat sheet. */
export const Route = createFileRoute("/session")({ component: Session })

const NARROW = "(max-width: 719px)"

function useNarrow(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia(NARROW)
      query.addEventListener("change", listener)

      return () => query.removeEventListener("change", listener)
    },
    () => window.matchMedia(NARROW).matches
  )
}

function Session() {
  const navigate = useNavigate()
  const { data: session } = useSession()
  const { data: folder } = useFolder()
  const leave = useLeave()
  const start = useStartTransfer()
  const narrow = useNarrow()
  const leaving = useRef(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [paths, setPaths] = useState<Record<Side, string>>({
    local: "",
    peer: "",
  })
  const [selection, setSelection] = useState<Record<Side, ReadonlySet<string>>>(
    { local: new Set(), peer: new Set() }
  )

  // Only a connected session belongs here. Idle after a click on Leave is our
  // own doing; any other idle means the other computer went away.
  const state = session?.state
  useEffect(() => {
    if (!state || state === "connected") return

    void navigate({
      to: "/",
      search: state === "idle" && !leaving.current ? { notice: "left" } : {},
      replace: true,
    })
  }, [state, navigate])

  if (!session || session.state !== "connected" || !session.peer) {
    return (
      <p role="status" aria-busy="true" className="p-8">
        Loading the session…
      </p>
    )
  }
  const peer = session.peer

  const changePath = (side: Side, path: string) => {
    setPaths((current) => ({ ...current, [side]: path }))
    setSelection((current) => ({ ...current, [side]: new Set() }))
  }

  const send = async (from: Side, names: string[]) => {
    setMessage(null)

    for (const name of names) {
      try {
        // Both paths are built from the two panes' own folders. A peer's name
        // is only ever the last step, and joinPath refuses separators.
        const local = joinPath(paths.local, name)
        const remote = joinPath(paths.peer, name)

        await start.mutateAsync(
          from === "local"
            ? { direction: "upload", source: local, destination: remote }
            : { direction: "download", source: remote, destination: local }
        )
      } catch (reason) {
        setMessage(
          reason instanceof Error ? reason.message : "Could not start that."
        )

        return
      }
    }
  }

  const onDrop = (payload: RowsPayload) =>
    void send(payload.side, payload.names)

  const pane = (side: Side) => (
    <FilePane
      side={side}
      label={
        side === "local"
          ? "Files on this computer"
          : `Files on ${peer.displayName}`
      }
      rootName={
        side === "local"
          ? (folder?.name ?? "Shared folder")
          : peer.sharedFolderName
      }
      path={paths[side]}
      onPathChange={(path) => changePath(side, path)}
      selected={selection[side]}
      onSelectedChange={(next) =>
        setSelection((current) => ({ ...current, [side]: next }))
      }
      onSend={(names) => void send(side, names)}
      onDropRows={onDrop}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SessionBar
        peer={peer}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen(!chatOpen)}
        leaving={leave.isPending}
        onLeave={() => {
          leaving.current = true
          leave.mutate(undefined, {
            onSuccess: () => void navigate({ to: "/", replace: true }),
            onError: () => {
              leaving.current = false
            },
          })
        }}
      />
      {message || leave.error ? (
        <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">
          {message ?? leave.error?.message}
        </p>
      ) : null}
      <main className="min-h-0 flex-1">
        <ResizablePanelGroup orientation={narrow ? "vertical" : "horizontal"}>
          <ResizablePanel
            id="local"
            defaultSize="50"
            minSize={narrow ? 120 : 280}
          >
            {pane("local")}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="peer"
            defaultSize="50"
            minSize={narrow ? 120 : 280}
          >
            {pane("peer")}
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
      <TransferDock />
      <ChatSheet
        open={chatOpen}
        onOpenChange={setChatOpen}
        peerName={peer.displayName}
      />
    </div>
  )
}
