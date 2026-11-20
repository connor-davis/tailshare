import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PeerInfo } from "@/lib/api/types"
import { usePanelLayout, usePanelOpen } from "./panel-layout"
import { RoomChat } from "./room-chat"
import { RoomFiles } from "./room-files"
import { RoomHeader } from "./room-header"
import { TransfersPanel } from "./transfers-panel"

/**
 * The middle of the app while connected: header, Files and Chat tabs, and the
 * transfers panel at the bottom. Fills its panel and scrolls inside. The
 * transfers panel never collapses by dragging; its button hides it down to
 * the header, and that choice is saved.
 */
export function RoomView({
  peer,
  onLeave,
  leaving,
  code,
  startedAt,
}: {
  /** The other computer; missing while the host waits for someone. */
  peer?: PeerInfo
  /** Leaves the room. */
  onLeave: () => void
  /** True while the leave call is running. */
  leaving: boolean
  /** The code to share again; only the host has one. */
  code?: string
  /** Epoch milliseconds the room opened, for the code countdown. */
  startedAt?: number | null
}) {
  const [transfersOpen, toggleTransfers] = usePanelOpen("transfers")
  const layout = usePanelLayout(
    "room-main",
    transfersOpen ? ["tabs", "transfers"] : ["tabs"]
  )

  const tabs = (
    <Tabs defaultValue="files" className="h-full min-h-0 gap-0">
      <TabsList variant="line" className="px-3">
        <TabsTrigger value="files">Files</TabsTrigger>
        <TabsTrigger value="chat">Chat</TabsTrigger>
      </TabsList>
      <TabsContent value="files" className="min-h-0 flex-1">
        <RoomFiles peer={peer} />
      </TabsContent>
      <TabsContent value="chat" className="min-h-0 flex-1">
        <RoomChat connected={peer !== undefined} />
      </TabsContent>
    </Tabs>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RoomHeader
        peer={peer}
        onLeave={onLeave}
        leaving={leaving}
        code={code}
        startedAt={startedAt}
      />
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          key={transfersOpen ? "split" : "tabs-only"}
          id="room-main"
          orientation="vertical"
          {...layout}
        >
          <ResizablePanel id="tabs" minSize={160}>
            {tabs}
          </ResizablePanel>
          {transfersOpen ? (
            <>
              <ResizableHandle />
              <ResizablePanel
                id="transfers"
                defaultSize={180}
                minSize={120}
                maxSize="70%"
              >
                <TransfersPanel collapsed={false} onToggle={toggleTransfers} />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
      {transfersOpen ? null : (
        <div className="h-10 shrink-0">
          <TransfersPanel collapsed onToggle={toggleTransfers} />
        </div>
      )}
    </div>
  )
}
