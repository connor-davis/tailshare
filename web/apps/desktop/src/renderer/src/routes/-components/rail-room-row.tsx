import { useT } from "@/i18n/provider"
import { RotateCcwIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatCode } from "@/lib/code-input"
import { formatAgo } from "@/lib/format"

/** A saved room is a hollow ring; a live one is filled, so it is not colour alone. */
export function Dot({ live }: { live: boolean }) {
  return (
    <span
      aria-hidden
      className={
        live
          ? "size-2 shrink-0 rounded-full bg-success"
          : "size-2 shrink-0 rounded-full border border-muted-foreground bg-transparent"
      }
    />
  )
}

/**
 * One saved room in the rail: Rejoin, Reopen as host and Forget. While a room
 * is open or starting the first two are aria-disabled, not disabled, so
 * keyboard users can still reach them and hear why from the tooltip.
 */
export function RailRoomRow({
  room,
  idle,
  canStart,
  onRejoin,
  onReopen,
  onForget,
}: {
  room: { name: string; code: string; lastSeen: number }
  /** True when no room is open. */
  idle: boolean
  /** True when Rejoin and Reopen may run (idle and not busy). */
  canStart: boolean
  onRejoin: (code: string) => void
  onReopen: (room: { name: string; code: string }) => void
  /** Removes the room from the saved list. */
  onForget: (code: string) => void
}) {
  const t = useT()

  return (
    <li className="group relative flex h-8 items-center rounded-md focus-within:bg-accent/60 hover:bg-accent/60">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            aria-disabled={!canStart}
            aria-label={t("railRoomRow.rejoinRecentRoom", { name: room.name })}
            onClick={() => {
              if (canStart) onRejoin(room.code)
            }}
          >
            <span aria-hidden className="rail-initial">
              {Array.from(room.name)[0]}
            </span>
            <Dot live={false} />
            <span className="min-w-0 flex-1 truncate" dir="auto">
              {room.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums group-focus-within:hidden group-hover:hidden">
              {formatAgo(room.lastSeen)}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {t("railRoomRow.recentDescription", {
            name: room.name,
            code: formatCode(room.code),
            time: formatAgo(room.lastSeen),
            hint: !idle ? t("railRoomRow.leaveFirst") : "",
          })}
        </TooltipContent>
      </Tooltip>
      <Button
        size="icon-xs"
        variant="ghost"
        className="absolute end-7 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        aria-label={t("railRoomRow.reopen", { name: room.name })}
        aria-disabled={!canStart}
        onClick={() => {
          if (canStart) onReopen(room)
        }}
      >
        <RotateCcwIcon aria-hidden />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        className="absolute end-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={t("railRoomRow.forget", { name: room.name })}
        onClick={() => onForget(room.code)}
      >
        <XIcon aria-hidden />
      </Button>
    </li>
  )
}
