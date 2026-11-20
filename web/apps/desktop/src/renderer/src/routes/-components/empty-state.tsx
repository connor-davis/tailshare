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
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold">Share files with a friend</h1>
      <p className="max-w-sm text-muted-foreground">
        Create a room and send the link, or join one with a code.
      </p>
      <Button
        size="lg"
        className="h-12 px-8 text-base"
        disabled={!enabled || busy}
        onClick={onCreate}
      >
        {busy ? "Working…" : "Create room"}
      </Button>
      <div className="w-full max-w-md">
        <JoinForm
          id="join-input"
          enabled={enabled}
          busy={busy}
          onJoin={onJoin}
        />
      </div>
    </div>
  )
}
