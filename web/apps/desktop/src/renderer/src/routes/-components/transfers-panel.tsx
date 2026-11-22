import { useT } from "@/i18n/provider"
import { t } from "../../i18n/index"
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
import { useClearTransfers, useTransfers } from "@/lib/api/transfers"
import type { TransferView } from "@/lib/api/types"
import { TransferRow } from "../session/-components/transfer-row"

const FINISHED = ["done", "failed", "canceled"]

function summary(items: TransferView[]): string {
  const count = (states: string[]) =>
    items.filter((item) => states.includes(item.state)).length
  const parts = [
    [count(["queued", "starting", "running"]), "transfersPanel.activeCount"],
    [count(["paused"]), "transfersPanel.pausedCount"],
    [count(["failed"]), "transfersPanel.failedCount"],
    [count(["done"]), "transfersPanel.doneCount"],
    [count(["canceled"]), "transfersPanel.canceledCount"],
  ] as const

  const text = parts
    .filter(([number]) => number > 0)
    .map(([number, word]) => t(word, { count: number }))

  return text.length > 0 ? text.join(" · ") : t("transfersPanel.noTransfersYet")
}

/** The transfer queue inside a tile, with counts and local Clear actions. */
export function TransfersPanel() {
  const t = useT()

  const { data = [] } = useTransfers()
  const clear = useClearTransfers()
  const items = data
  const finished = items.filter((item) => FINISHED.includes(item.state))

  return (
    <section
      aria-label={t("transfersPanel.transferList")}
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
            disabled={clear.isPending}
            onClick={() => clear.mutate()}
          >
            {t("transfersPanel.clearFinished")}
          </Button>
        ) : null}
      </header>
      {clear.error ? (
        <p role="alert" className="px-3 text-xs text-destructive">
          {clear.error.message}
        </p>
      ) : null}
      {items.length === 0 ? (
        <Empty className="min-h-0 gap-2 p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArrowDownUpIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t("transfersPanel.noTransfersYet")}</EmptyTitle>
            <EmptyDescription>
              {t("transfersPanel.filesYouDownloadShowUpHere")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul>
            {items.map((item) => (
              <TransferRow key={item.id} item={item} />
            ))}
          </ul>
        </ScrollArea>
      )}
    </section>
  )
}
