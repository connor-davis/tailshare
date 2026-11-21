import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PeerInfo } from "@/lib/api/types"
import { AppsPanel } from "./apps-panel"
import { usePanelLayout, usePanelOpen } from "./panel-layout"
import { RoomChat } from "./room-chat"
import { RoomHeader } from "./room-header"
import { TransfersPanel } from "./transfers-panel"

/**
 * The middle of the app while connected: header, the chat with its composer, and
 * the transfers panel at the bottom. Fills its panel and scrolls inside. The
 * transfers panel never collapses by dragging; its button hides it down to
 * the header, and that choice is saved.
 */
export function RoomView({
  peer,
  roomName,
  onLeave,
  leaving,
  code,
  roomCode,
  startedAt,
}: {
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
  /** Epoch milliseconds the room opened, for the code countdown. */
  startedAt?: number | null
}) {
  const [transfersOpen, toggleTransfers] = usePanelOpen("transfers")
  const layout = usePanelLayout(
    "room-main",
    transfersOpen ? ["chat", "transfers"] : ["chat"]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RoomHeader
        peer={peer}
        roomName={roomName}
        onLeave={onLeave}
        leaving={leaving}
        code={code}
        roomCode={roomCode}
        startedAt={startedAt}
      />
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          key={transfersOpen ? "split" : "chat-only"}
          id="room-main"
          orientation="vertical"
          {...layout}
        >
          <ResizablePanel id="chat" minSize={160}>
            <Tabs defaultValue="chat" className="h-full min-h-0 gap-0">
              <TabsList variant="line" className="px-2">
                <TabsTrigger value="chat">Chat</TabsTrigger>
                <TabsTrigger value="apps">Apps</TabsTrigger>
              </TabsList>
              {/* forceMount keeps the chat alive (and scrolled) on the Apps tab. */}
              <TabsContent
                value="chat"
                forceMount
                className="min-h-0 flex-1 data-[state=inactive]:hidden"
              >
                <RoomChat connected={peer !== undefined} />
              </TabsContent>
              <TabsContent value="apps" className="min-h-0 flex-1">
                <AppsPanel connected={peer !== undefined} />
              </TabsContent>
            </Tabs>
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
