import { useEffect, useRef, useState, type DragEvent } from "react"
import { MessageSquareIcon, UploadIcon, XIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useChat } from "@/lib/api/chat"
import { formatTime } from "@/lib/format"
import { ChatComposer } from "./chat-composer"
import { FileCard } from "./file-card"
import { useShareFiles } from "./use-share-files"

/** How close to the bottom still counts as "reading the newest message". */
const STICK_PX = 48

/**
 * The chat column: messages fill it, the composer sits at the bottom and
 * files can be dropped anywhere on it. Messages live in memory only and are
 * gone when the session ends.
 */
export function RoomChat({ connected = true }: { connected?: boolean }) {
  const { data: messages = [], error } = useChat(connected)
  const share = useShareFiles()
  const [log, setLog] = useState<HTMLDivElement | null>(null)
  // False once the reader scrolls up, so new messages do not pull them down.
  const stuck = useRef(true)
  const [dragging, setDragging] = useState(false)
  // Enter and leave fire for every child, so count them instead of toggling.
  const depth = useRef(0)

  // The scrolling part is the viewport inside the ScrollArea, not its root.
  useEffect(() => {
    const viewport = log?.querySelector('[data-slot="scroll-area-viewport"]')
    if (!viewport) return

    const onScroll = () => {
      stuck.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
        STICK_PX
    }
    viewport.addEventListener("scroll", onScroll)

    return () => viewport.removeEventListener("scroll", onScroll)
  }, [log])

  useEffect(() => {
    const viewport = log?.querySelector('[data-slot="scroll-area-viewport"]')
    if (stuck.current) viewport?.scrollTo({ top: viewport.scrollHeight })
  }, [messages.length, log])

  const hasFiles = (event: DragEvent) =>
    connected && event.dataTransfer.types.includes("Files")

  const stopDrag = () => {
    depth.current = 0
    setDragging(false)
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        depth.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => {
        // Without this the browser refuses the drop.
        if (hasFiles(event)) event.preventDefault()
      }}
      onDragLeave={(event) => {
        if (!hasFiles(event)) return
        depth.current -= 1
        if (depth.current <= 0) stopDrag()
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        stopDrag()

        const files = Array.from(event.dataTransfer.files)
        if (files.length > 0) void share.addDropped(files)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") stopDrag()
      }}
    >
      <div
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        className="flex min-h-0 flex-1 flex-col"
      >
        {messages.length === 0 && !error ? (
          // Nothing to scroll yet, so the hint sits in the middle of the column.
          <Empty className="min-h-0 flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareIcon aria-hidden />
              </EmptyMedia>
              <EmptyTitle>
                {connected ? "No messages yet" : "Nobody here yet"}
              </EmptyTitle>
              <EmptyDescription>
                {connected
                  ? "Write one, or add a file with the + button."
                  : "Send the link. You can write and share files once someone else joins."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea ref={setLog} className="min-h-0 flex-1">
            <div className="flex w-full flex-col gap-4 p-4">
              {messages.map((message) => (
                <div key={message.id} className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {message.fromPeer ? "Them" : "You"}
                    </span>{" "}
                    <time dateTime={message.time}>
                      {formatTime(message.time)}
                    </time>
                  </p>
                  {message.text ? (
                    <p className="break-words whitespace-pre-wrap">
                      {message.text}
                    </p>
                  ) : null}
                  {message.attachment ? (
                    <FileCard
                      attachment={message.attachment}
                      fromPeer={message.fromPeer}
                    />
                  ) : null}
                </div>
              ))}
              {error ? (
                <p role="alert" className="text-destructive">
                  {error.message}
                </p>
              ) : null}
            </div>
          </ScrollArea>
        )}
      </div>
      {share.error || share.skipped.length > 0 ? (
        <div className="flex w-full px-4 pb-2">
          <Alert
            role="status"
            variant={share.error ? "destructive" : "default"}
            className="relative pr-10"
          >
            <AlertDescription>
              {share.error ??
                share.skipped
                  .map((file) => `${file.name}: ${file.reason}`)
                  .join(" ")}
            </AlertDescription>
            <Button
              size="icon-xs"
              variant="ghost"
              className="absolute top-2 right-2"
              aria-label="Dismiss"
              onClick={share.dismiss}
            >
              <XIcon aria-hidden />
            </Button>
          </Alert>
        </div>
      ) : null}
      <ChatComposer
        connected={connected}
        busy={share.busy}
        onAddFiles={() => void share.addFiles()}
        onPaste={() => void share.paste()}
      />
      {dragging ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-background/85 text-primary"
        >
          <UploadIcon aria-hidden className="size-8" />
          <p className="text-lg font-semibold">Drop to share</p>
        </div>
      ) : null}
    </div>
  )
}
