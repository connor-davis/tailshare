import { useT } from "@/i18n/provider"
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
  const t = useT()

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
          <UploadIcon aria-hidden />
          {t("roomFiles.shareFiles")}
        </Button>
        <Button
          variant="outline"
          disabled={!connected || share.busy}
          onClick={() => void share.addFolder()}
        >
          {t("roomFiles.folder")}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("roomFiles.sharedCount", { count: files.length })}
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
                {t("roomFiles.noSharedFilesYet")}
              </p>
              <p>
                {connected
                  ? t("roomFiles.addFilesOrDropThemHereTo")
                  : t("roomFiles.waitToShare")}
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
          className="relative rounded-none pe-12"
          role={share.error ? "alert" : "status"}
          variant={share.error ? "destructive" : "default"}
        >
          <AlertDescription>
            {share.error ??
              share.skipped
                .map((file) =>
                  t("roomFiles.message", {
                    name: file.name,
                    reason: file.reason,
                  })
                )
                .join(" ")}
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("roomFiles.dismissFileNotice")}
            className="absolute end-2 top-2"
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
          {t("roomFiles.dropToShare")}
        </div>
      ) : null}
    </div>
  )
}
