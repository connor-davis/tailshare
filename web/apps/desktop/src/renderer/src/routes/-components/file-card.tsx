import { Progress } from "@/components/ui/progress"
import { useContext, useState } from "react"
import { DownloadIcon, FileIcon, FolderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTransfers, useStartTransfer } from "@/lib/api/transfers"
import type { ChatAttachment } from "@/lib/api/types"
import { useDownloadsOk } from "@/components/use-downloads-status"
import { FilePreview } from "./file-preview"
import { useDownloadPreview, useRoomPreview } from "@/lib/api/preview"
import { FolderBrowseContext } from "./folder-browse-context"
import { formatBytes, formatSpeed, percent } from "@/lib/format"

/**
 * A shared file in the chat. Our own file says "Shared". The other person's
 * has a Download button; after a click the card follows that transfer, so
 * progress, "Saved" and a failure all show right here.
 */
export function FileCard({
  attachment,
  fromPeer,
}: {
  /** The file this message shares. */
  attachment: ChatAttachment
  /** True when the other computer shared it. */
  fromPeer: boolean
}) {
  const browse = useContext(FolderBrowseContext)

  const [folderQueued, setFolderQueued] = useState(false)

  const { data: transfers = [] } = useTransfers()

  const start = useStartTransfer()

  const downloadsOk = useDownloadsOk()
  // The id is exact; matching by name breaks when the same file is fetched twice.
  const [transferId, setTransferId] = useState<string | null>(null)
  // A retry gives the transfer a new id, so follow the newest download of the
  // same file once the first row is gone.
  const first = transfers.find((item) => item.id === transferId)

  const transfer =
    first ??
    (transferId
      ? [...transfers]
          .reverse()
          .find(
            (item) =>
              item.direction === "download" && item.source === attachment.path
          )
      : undefined)

  // Our own file is read by the sidecar from the shared folder. The peer's file
  // can only be previewed once it is saved here.
  const saved = fromPeer && transfer?.state === "done" ? transfer.id : undefined

  const own = useRoomPreview(attachment.path, !fromPeer && !attachment.folder)

  const mine = useDownloadPreview(saved)

  const preview = fromPeer ? mine.data : own.data

  const download = () =>
    start.mutate(
      {
        direction: "download",
        source: attachment.path,
        destination: attachment.name,
        ...(attachment.folder ? { folder: true } : {}),
      },
      {
        onSuccess: (item) => {
          if (attachment.folder && item) setFolderQueued(true)
          else if (item) setTransferId(item.id)
        },
      }
    )

  const active =
    transfer &&
    ["queued", "starting", "running", "paused"].includes(transfer.state)

  const startError = start.error?.message

  let status = <p className="text-xs text-muted-foreground">Shared</p>
  if (fromPeer) {
    if (attachment.folder && folderQueued) {
      status = (
        <p className="text-xs text-muted-foreground">Added to transfers</p>
      )
    } else if (active) {
      const done = percent(transfer.bytes, transfer.size)
      status = (
        <div className="flex flex-col gap-1">
          <Progress
            className="h-1.5"
            aria-label={`${attachment.name} progress`}
            value={done}
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {transfer.state === "paused"
              ? `Paused · ${done}%`
              : `${done}% · ${formatSpeed(transfer.speed)}`}
          </p>
        </div>
      )
    } else if (transfer?.state === "done") {
      status = <p className="text-xs font-medium">Saved</p>
    } else {
      const failed = transfer?.state === "failed"

      const note = failed
        ? (transfer.error ?? "Could not download this file.")
        : transfer?.state === "canceled"
          ? "Canceled."
          : startError

      status = (
        <div className="flex flex-col items-start gap-1">
          {note ? (
            <p role="alert" className="text-xs text-destructive">
              {note}
            </p>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={start.isPending || !downloadsOk}
            aria-label={`${note ? "Download again" : "Download"} ${attachment.name}`}
            onClick={download}
          >
            <DownloadIcon aria-hidden data-icon="inline-start" />
            {note ? "Try again" : "Download"}
          </Button>
        </div>
      )
    }
  }

  return (
    <div className="flex w-72 max-w-full items-start gap-3 rounded-xl border border-border bg-card p-3">
      {attachment.folder ? (
        <FolderIcon
          aria-hidden
          className="mt-0.5 size-8 shrink-0 text-primary"
        />
      ) : (
        <FileIcon aria-hidden className="mt-0.5 size-8 shrink-0 text-primary" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-medium" title={attachment.name}>
          {attachment.name}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {attachment.folder ? `${attachment.count ?? 0} files · ` : ""}
          {formatBytes(attachment.size)}
        </p>
        {!attachment.folder ? (
          <FilePreview preview={preview} name={attachment.name} />
        ) : null}
        {attachment.folder ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              browse({
                path: attachment.path,
                name: attachment.name,
                scope: fromPeer ? "peer" : "local",
              })
            }
          >
            Browse
          </Button>
        ) : null}
        {fromPeer && !saved && !attachment.folder ? (
          <p className="text-xs text-muted-foreground">
            Preview after you download it
          </p>
        ) : null}
        {status}
      </div>
    </div>
  )
}
