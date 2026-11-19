import { useState } from "react"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTransfers } from "@/lib/api/transfers"
import type { TransferView } from "@/lib/api/types"
import { TransferRow } from "./transfer-row"

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

/** The queue under the panes. Collapses to its header. */
export function TransferDock() {
  const { data = [] } = useTransfers()
  const [open, setOpen] = useState(true)
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
      className="flex shrink-0 flex-col border-t bg-card"
      style={{ height: open ? 180 : 40 }}
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
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDownIcon aria-hidden data-icon="inline-start" />
          ) : (
            <ChevronUpIcon aria-hidden data-icon="inline-start" />
          )}
          {open ? "Collapse" : "Expand"}
        </Button>
      </header>
      {open ? (
        items.length === 0 ? (
          <p className="p-4 text-center text-muted-foreground">
            No transfers yet. Drag a file to the other pane.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-auto">
            {items.map((item) => (
              <TransferRow
                key={item.id}
                item={item}
                onClear={(id) => hide([id])}
              />
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}
