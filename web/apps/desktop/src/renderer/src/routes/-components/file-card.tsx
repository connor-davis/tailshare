import { useState } from "react"
import { DownloadIcon, FileIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTransfers, useStartTransfer } from "@/lib/api/transfers"
import type { ChatAttachment } from "@/lib/api/types"
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
  const { data: transfers = [] } = useTransfers()
  const start = useStartTransfer()
  // The id is exact; matching by name breaks when the same file is fetched twice.
  const [transferId, setTransferId] = useState<string | null>(null)
  const transfer = transfers.find((item) => item.id === transferId)

  const download = () =>
    start.mutate(
      {
        direction: "download",
        source: attachment.path,
        destination: attachment.name,
      },
      { onSuccess: (item) => setTransferId(item.id) }
    )

  const active =
    transfer &&
    ["queued", "starting", "running", "paused"].includes(transfer.state)
  const startError = start.error?.message

  let status = <p className="text-xs text-muted-foreground">Shared</p>
  if (fromPeer) {
    if (active) {
      const done = percent(transfer.bytes, transfer.size)
      status = (
        <div className="flex flex-col gap-1">
          <progress
            className="h-1.5 w-full accent-primary"
            aria-label={`${attachment.name} progress`}
            max={100}
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
            disabled={start.isPending}
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
      <FileIcon aria-hidden className="mt-0.5 size-8 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-medium" title={attachment.name}>
          {attachment.name}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatBytes(attachment.size)}
        </p>
        {status}
      </div>
    </div>
  )
}
