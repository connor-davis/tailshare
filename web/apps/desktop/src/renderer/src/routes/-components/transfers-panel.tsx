import { useState } from "react"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTransfers } from "@/lib/api/transfers"
import type { TransferView } from "@/lib/api/types"
import { TransferRow } from "../session/-components/transfer-row"

const FINISHED = ["done", "failed", "canceled"]

function summary(items: TransferView[]): string {
  const count = (states: string[]) =>
    items.filter((item) => states.includes(item.state)).length
  const parts = [
    [count(["queued", "starting", "running"]), "active"],
    [count(["paused"]), "paused"],
    [count(["failed"]), "failed"],
    [count(["done"]), "done"],
    [count(["canceled"]), "canceled"],
  ] as const

  const text = parts
    .filter(([number]) => number > 0)
    .map(([number, word]) => `${number} ${word}`)

  return text.length > 0 ? text.join(" · ") : "No transfers yet"
}

/**
 * The queue at the bottom of the room. Its panel decides the height; the
 * button only asks the panel to collapse to this header or open again.
 */
export function TransfersPanel({
  collapsed,
  onToggle,
}: {
  /** True while the panel is squeezed down to its header. */
  collapsed: boolean
  /** Asks the panel to collapse or expand. */
  onToggle: () => void
}) {
  const { data = [] } = useTransfers()
  // ponytail: "Clear" hides rows on this screen only. The API has no remove
  // event; upgrade is a delete route plus a remove event.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const items = data.filter((item) => !hidden.has(item.id))
  const finished = items.filter((item) => FINISHED.includes(item.state))

  const hide = (ids: string[]) =>
    setHidden((current) => new Set([...current, ...ids]))

  return (
    <section
      aria-label="Transfers"
      className="flex h-full min-h-0 flex-col border-t bg-card"
    >
      <header className="flex h-10 shrink-0 items-center gap-3 px-3">
        <h2 className="text-sm font-semibold">Transfers</h2>
        <p className="flex-1 text-xs text-muted-foreground tabular-nums">
          {summary(items)}
        </p>
        {finished.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => hide(finished.map((item) => item.id))}
          >
            Clear finished
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? (
            <ChevronUpIcon aria-hidden data-icon="inline-start" />
          ) : (
            <ChevronDownIcon aria-hidden data-icon="inline-start" />
          )}
          {collapsed ? "Expand" : "Collapse"}
        </Button>
      </header>
      {collapsed ? null : items.length === 0 ? (
        <p className="p-4 text-center text-muted-foreground">
          No transfers yet. Drag a file to the other pane.
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul>
            {items.map((item) => (
              <TransferRow
                key={item.id}
                item={item}
                onClear={(id) => hide([id])}
              />
            ))}
          </ul>
        </ScrollArea>
      )}
    </section>
  )
}
