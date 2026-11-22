import { useT } from "@/i18n/provider"
import { t } from "../../../i18n/index"
import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { useTransferAction } from "@/lib/api/transfers"
import type { TransferState, TransferView } from "@/lib/api/types"
import { formatSpeed, percent } from "@/lib/format"

const stateWords = (): Record<TransferState, string> => ({
  queued: t("transferRow.queued"),
  starting: t("transferRow.starting"),
  running: t("transferRow.running"),
  paused: t("transferRow.paused"),
  done: t("transferRow.done"),
  failed: t("transferRow.failed"),
  canceled: t("transferRow.canceled"),
})

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
  const t = useT()

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
      title={draggable ? t("transferRow.dragThisFileToAFolder") : undefined}
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
          {item.direction === "upload"
            ? t("transferRow.upload")
            : t("transferRow.download")}
        </span>
        <span className="min-w-32 flex-1 basis-40 truncate" title={item.source}>
          {name}
        </span>
        <Progress
          className="h-1.5 w-32 shrink-0"
          value={done}
          aria-label={t("transferRow.progress", { name: name })}
        />
        <span className="w-32 shrink-0 text-xs tabular-nums">
          {done}% ·{" "}
          {formatSpeed(item.state === "running" ? item.speed : undefined)}
        </span>
        <span className="w-20 shrink-0 text-xs font-medium">
          {stateWords()[item.state]}
        </span>
        <span className="ml-auto flex shrink-0 gap-1">
          {running ? (
            <Button
              size="sm"
              variant="outline"
              aria-label={t("transferRow.pauseLabel", { name: name })}
              onClick={() => act("pause")}
            >
              {t("transferRow.pause")}
            </Button>
          ) : null}
          {item.state === "paused" ? (
            <Button
              size="sm"
              variant="outline"
              aria-label={t("transferRow.resumeLabel", { name: name })}
              onClick={() => act("resume")}
            >
              {t("transferRow.resume")}
            </Button>
          ) : null}
          {item.state === "failed" && retrySeconds === null ? (
            <Button
              size="sm"
              variant="outline"
              aria-label={t("transferRow.retryLabel", { name: name })}
              onClick={() => act("resume")}
            >
              {t("transferRow.retry")}
            </Button>
          ) : null}
          {draggable ? (
            <Button
              size="sm"
              variant="outline"
              aria-label={t("transferRow.showFileLabel", { name: name })}
              onClick={() =>
                Promise.resolve(window.tailshare.revealDownload(item.id)).catch(
                  () => {}
                )
              }
            >
              {t("transferRow.showFile")}
            </Button>
          ) : null}
          {running || item.state === "paused" ? (
            <Button
              size="sm"
              variant="outline"
              aria-label={t("transferRow.cancelLabel", { name: name })}
              onClick={() => act("cancel")}
            >
              {t("transferRow.cancel")}
            </Button>
          ) : null}
        </span>
      </div>
      {retrySeconds !== null ? (
        <p className="pl-23 text-xs text-muted-foreground">
          {t("transferRow.retryCountdown", {
            seconds: retrySeconds,
            attempt: (item.attempt ?? 0) + 1,
          })}
        </p>
      ) : null}
      {item.error ? (
        <p className="pl-23 text-xs text-destructive">
          {t("transferRow.failedError2", { error: item.error })}
        </p>
      ) : null}
      {action.error ? (
        <p role="alert" className="pl-23 text-xs text-destructive">
          {action.error.message}
        </p>
      ) : null}
    </li>
  )
}
