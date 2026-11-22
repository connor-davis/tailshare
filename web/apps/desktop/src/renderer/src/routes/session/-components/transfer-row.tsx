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

// Asks main whether this finished download can be dragged out. Main only says
// yes for files it saved itself and that are still there.
function useCanDrag(id: string, finished: boolean): boolean {
  const [can, setCan] = useState(false)

  useEffect(() => {
    if (!finished) return

    let alive = true
    // No bridge (a test or a plain browser) just means no drag.
    Promise.resolve(window.tailshare?.canDragFile(id))
      .then((ok) => alive && setCan(ok === true))
      .catch(() => alive && setCan(false))

    return () => {
      alive = false
    }
  }, [id, finished])

  // A row that is no longer finished is never draggable, whatever was asked before.
  return finished && can
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
  const finished = item.direction === "download" && item.state === "done"
  const draggable = useCanDrag(item.id, finished)
  const act = (choice: "pause" | "resume" | "cancel") =>
    action.mutate({ id: item.id, action: choice })

  return (
    <li
      className="flex flex-col gap-1 border-b px-3 py-2"
      draggable={draggable || undefined}
      title={draggable ? "Drag this file to a folder" : undefined}
      onDragStart={
        draggable
          ? (event) => {
              // Electron starts the real file drag; the page's own drag is not wanted.
              event.preventDefault()
              Promise.resolve(window.tailshare.startFileDrag(item.id)).catch(
                () => {}
              )
            }
          : undefined
      }
    >
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
            <Button
              size="sm"
              variant="outline"
              aria-label={`Pause ${name}`}
              onClick={() => act("pause")}
            >
              Pause
            </Button>
          ) : null}
          {item.state === "paused" ? (
            <Button
              size="sm"
              variant="outline"
              aria-label={`Resume ${name}`}
              onClick={() => act("resume")}
            >
              Resume
            </Button>
          ) : null}
          {item.state === "failed" && retrySeconds === null ? (
            <Button
              size="sm"
              variant="outline"
              aria-label={`Retry ${name}`}
              onClick={() => act("resume")}
            >
              Retry
            </Button>
          ) : null}
          {draggable ? (
            <Button
              size="sm"
              variant="outline"
              aria-label={`Show file ${name}`}
              onClick={() =>
                Promise.resolve(window.tailshare.revealDownload(item.id)).catch(
                  () => {}
                )
              }
            >
              Show file
            </Button>
          ) : null}
          {running || item.state === "paused" ? (
            <Button
              size="sm"
              variant="outline"
              aria-label={`Cancel ${name}`}
              onClick={() => act("cancel")}
            >
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
