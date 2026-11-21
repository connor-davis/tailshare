import { useState } from "react"
import { ArrowDownUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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

/** The transfer queue inside a tile, with counts and local Clear actions. */
export function TransfersPanel() {
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
      className="flex h-full min-h-0 flex-col bg-card"
    >
      <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 px-3 py-2">
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
      </header>
      {items.length === 0 ? (
        <Empty className="min-h-0 gap-2 p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArrowDownUpIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No transfers yet</EmptyTitle>
            <EmptyDescription>
              Files you download show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
