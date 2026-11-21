import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { useTransferAction } from "@/lib/api/transfers"
import type { TransferState, TransferView } from "@/lib/api/types"
import { formatSpeed, percent } from "@/lib/format"

const STATE_WORDS: Record<TransferState, string> = {
  queued: "Queued",
  starting: "Starting",
  running: "Running",
  paused: "Paused",
  done: "Done",
  failed: "Failed",
  canceled: "Canceled",
}

/** Last part of a path with either kind of slash. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

// Seconds until the sidecar tries again, counted on the screen once a second.
function useRetrySeconds(retryAt?: string): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!retryAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(timer)
  }, [retryAt])

  if (!retryAt) return null
  const end = Date.parse(retryAt)

  return Number.isNaN(end) ? null : Math.max(0, Math.ceil((end - now) / 1000))
}

/** One transfer: name, progress, speed, state word and the buttons it needs. */
export function TransferRow({
  item,
}: {
  /** The transfer to show. */
  item: TransferView
}) {
  const retrySeconds = useRetrySeconds(item.retryAt)
  const action = useTransferAction()
  const name = baseName(item.source)
  const running = ["queued", "starting", "running"].includes(item.state)
  const done = percent(item.bytes, item.size)
  const act = (choice: "pause" | "resume" | "cancel") =>
    action.mutate({ id: item.id, action: choice })

  return (
    <li className="flex flex-col gap-1 border-b px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-20 shrink-0 text-xs text-muted-foreground">
          {item.direction === "upload" ? "Upload" : "Download"}
        </span>
        <span className="min-w-32 flex-1 basis-40 truncate" title={item.source}>
          {name}
        </span>
        <Progress
          className="h-1.5 w-32 shrink-0"
          value={done}
          aria-label={`${name} progress`}
        />
        <span className="w-32 shrink-0 text-xs tabular-nums">
          {done}% ·{" "}
          {formatSpeed(item.state === "running" ? item.speed : undefined)}
        </span>
        <span className="w-20 shrink-0 text-xs font-medium">
          {STATE_WORDS[item.state]}
        </span>
        <span className="ml-auto flex shrink-0 gap-1">
          {running ? (
            <Button size="sm" variant="outline" onClick={() => act("pause")}>
              Pause
            </Button>
          ) : null}
          {item.state === "paused" ? (
            <Button size="sm" variant="outline" onClick={() => act("resume")}>
              Resume
            </Button>
          ) : null}
          {item.state === "failed" && retrySeconds === null ? (
            <Button size="sm" variant="outline" onClick={() => act("resume")}>
              Retry
            </Button>
          ) : null}
          {running || item.state === "paused" ? (
            <Button size="sm" variant="outline" onClick={() => act("cancel")}>
              Cancel
            </Button>
          ) : null}
        </span>
      </div>
      {retrySeconds !== null ? (
        <p className="pl-23 text-xs text-muted-foreground">
          Retrying in {retrySeconds} s (try {(item.attempt ?? 0) + 1})
        </p>
      ) : null}
      {item.error ? (
        <p className="pl-23 text-xs text-destructive">Failed: {item.error}</p>
      ) : null}
      {action.error ? (
        <p role="alert" className="pl-23 text-xs text-destructive">
          {action.error.message}
        </p>
      ) : null}
    </li>
  )
}
