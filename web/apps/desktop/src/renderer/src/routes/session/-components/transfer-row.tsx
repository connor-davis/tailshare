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

/** One transfer: name, progress, speed, state word and the buttons it needs. */
export function TransferRow({
  item,
  onClear,
}: {
  /** The transfer to show. */
  item: TransferView
  /** Hides this row. It only affects this screen. */
  onClear: (id: string) => void
}) {
  const action = useTransferAction()
  const name = baseName(item.source)
  const running = ["queued", "starting", "running"].includes(item.state)
  const finished = ["done", "canceled", "failed"].includes(item.state)
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
          {item.state === "failed" ? (
            <Button size="sm" variant="outline" onClick={() => act("resume")}>
              Retry
            </Button>
          ) : null}
          {running || item.state === "paused" ? (
            <Button size="sm" variant="outline" onClick={() => act("cancel")}>
              Cancel
            </Button>
          ) : null}
          {finished ? (
            <Button size="sm" variant="ghost" onClick={() => onClear(item.id)}>
              Clear
            </Button>
          ) : null}
        </span>
      </div>
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
