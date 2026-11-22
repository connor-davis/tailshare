import { useT } from "@/i18n/provider"
import { Button } from "@/components/ui/button"
import { JoinForm } from "./join-form"

/**
 * The middle of the app when no room is open: one big Create room button,
 * and one box to join with a code or a pasted tailshare:// link.
 */
export function EmptyState({
  enabled,
  busy,
  onCreate,
  onJoin,
}: {
  /** False while another room is open. */
  enabled: boolean
  /** True while a host or join is running. */
  busy: boolean
  /** Starts a room on this computer. */
  onCreate: () => void
  /** Joins with the bare code. */
  onJoin: (code: string) => void
}) {
  const t = useT()

  return (
    <div className="spaces-hero overflow-hidden rounded-lg bg-chrome text-chrome-foreground">
      <div className="spaces-hazard" />
      <div className="grid gap-6 p-7 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div className="flex flex-col items-start gap-4">
          <h1 className="text-2xl font-semibold">
            {t("emptyState.shareFilesWithAFriend")}
          </h1>
          <p className="max-w-md text-chrome-muted">
            {t("emptyState.createARoomAndSendTheLink")}
          </p>
          <Button
            size="lg"
            className="h-12 px-8 text-base"
            disabled={!enabled || busy}
            onClick={onCreate}
          >
            {busy ? t("emptyState.working") : t("emptyState.createRoom")}
          </Button>
        </div>
        <div className="spaces-rail w-full rounded-lg border border-dashed border-border p-4">
          <JoinForm
            id="join-input"
            enabled={enabled}
            busy={busy}
            onJoin={onJoin}
          />
        </div>
      </div>
    </div>
  )
}
