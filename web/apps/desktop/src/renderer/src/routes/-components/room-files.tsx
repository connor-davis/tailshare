import { useState } from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useFolder } from "@/lib/api/folder"
import { joinPath, useStartTransfer } from "@/lib/api/transfers"
import type { PeerInfo, Side } from "@/lib/api/types"
import { FilePane } from "../session/-components/file-pane"
import type { RowsPayload } from "../session/-components/use-pane-drag"
import { usePanelLayout } from "./panel-layout"

/** The Files tab: this computer's folder next to the other computer's. */
export function RoomFiles({ peer }: { peer?: PeerInfo }) {
  const { data: folder } = useFolder()
  const start = useStartTransfer()
  const layout = usePanelLayout("files")
  const [message, setMessage] = useState<string | null>(null)
  const [paths, setPaths] = useState<Record<Side, string>>({
    local: "",
    peer: "",
  })
  const [selection, setSelection] = useState<Record<Side, ReadonlySet<string>>>(
    { local: new Set(), peer: new Set() }
  )

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

  const pane = (side: Side) =>
    side === "peer" && !peer ? (
      <p className="grid h-full place-items-center p-6 text-center text-muted-foreground">
        Nobody here yet. Send the link.
      </p>
    ) : (
      <FilePane
        side={side}
        label={
          side === "local"
            ? "Files on this computer"
            : `Files on ${peer?.displayName}`
        }
        rootName={
          side === "local"
            ? (folder?.name ?? "Shared folder")
            : (peer?.sharedFolderName ?? "")
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
      {message ? (
        <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup id="files" orientation="horizontal" {...layout}>
          <ResizablePanel id="local" defaultSize="50" minSize={200}>
            {pane("local")}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="peer" defaultSize="50" minSize={200}>
            {pane("peer")}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
