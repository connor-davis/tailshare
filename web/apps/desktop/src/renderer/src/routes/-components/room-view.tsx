import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import type { PeerInfo } from "@/lib/api/types"
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
  onLeave,
  leaving,
  code,
  roomCode,
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
            <RoomChat connected={peer !== undefined} />
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
