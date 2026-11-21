import { useRef, useState, type DragEvent } from "react"
import { FileIcon, UploadIcon, XIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useChat } from "@/lib/api/chat"
import { FileCard } from "./file-card"
import { useShareFiles } from "./use-share-files"

/** Files already shared in this session, using the existing attachment flow. */
export function RoomFiles({ connected }: { connected: boolean }) {
  const { data: messages = [], error } = useChat(connected)
  const share = useShareFiles()
  const depth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const files = messages.filter((message) => message.attachment)
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
        const dropped = Array.from(event.dataTransfer.files)
        if (dropped.length) void share.addDropped(dropped)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") stopDrag()
      }}
    >
      <div className="flex flex-wrap items-center gap-3 border-b p-3">
        <Button
          disabled={!connected || share.busy}
          onClick={() => void share.addFiles()}
        >
          <UploadIcon aria-hidden /> Share files
        </Button>
        <p className="text-xs text-muted-foreground">
          {files.length} shared {files.length === 1 ? "file" : "files"}
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-wrap gap-3 p-3">
          {files.map((message) =>
            message.attachment ? (
              <FileCard
                key={message.id}
                attachment={message.attachment}
                fromPeer={message.fromPeer}
              />
            ) : null
          )}
          {!files.length ? (
            <div className="flex min-h-36 w-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <FileIcon aria-hidden className="size-7" />
              <p className="font-semibold text-foreground">
                No shared files yet
              </p>
              <p>
                {connected
                  ? "Add files or drop them here to share."
                  : "You can share files once someone else joins."}
              </p>
            </div>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="p-3 text-destructive">
            {error.message}
          </p>
        ) : null}
      </ScrollArea>
      {share.error || share.skipped.length ? (
        <Alert
          className="relative rounded-none pr-12"
          role="status"
          variant={share.error ? "destructive" : "default"}
        >
          <AlertDescription>
            {share.error ??
              share.skipped
                .map((file) => `${file.name}: ${file.reason}`)
                .join(" ")}
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss file notice"
            className="absolute top-2 right-2"
            onClick={share.dismiss}
          >
            <XIcon aria-hidden />
          </Button>
        </Alert>
      ) : null}
      {dragging ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/95 font-semibold"
        >
          Drop to share
        </div>
      ) : null}
    </div>
  )
}
