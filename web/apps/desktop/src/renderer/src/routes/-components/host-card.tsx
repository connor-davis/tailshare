import { useEffect, useState } from "react"
import { announce } from "@/components/status-region"
import { Button } from "@/components/ui/button"
import { useHost, useLeave } from "@/lib/api/session"
import type { SessionState } from "@/lib/api/types"
import { formatCode } from "@/lib/code-input"
import { formatCountdown } from "@/lib/format"

/** A code lives this long. The API has no `expiresAt`, so we count it here. */
const CODE_LIFETIME_MS = 10 * 60 * 1000

/**
 * Host side of the connect screen: a button, then the code while waiting.
 * `startedAt` is when the host reply came, or null after a reload.
 */
export function HostCard({
  session,
  enabled,
  startedAt,
  onHosted,
  onCancelled,
}: {
  /** The current session. */
  session: SessionState
  /** False until a folder is chosen. */
  enabled: boolean
  /** Epoch milliseconds of the host reply; null when unknown. */
  startedAt: number | null
  /** Called with the time the host reply came. */
  onHosted: (at: number) => void
  /** Called when the user stops waiting, so no "ran out" notice shows. */
  onCancelled: () => void
}) {
  const host = useHost()
  const leave = useLeave()
  const hosting = session.state === "hosting" && Boolean(session.code)

  if (hosting) {
    return (
      <section
        aria-labelledby="host-title"
        className="flex flex-col gap-3 rounded-lg border bg-card p-4"
      >
        <h2 id="host-title" className="text-sm font-semibold">
          Share this code
        </h2>
        <Code code={session.code ?? ""} />
        <p className="text-muted-foreground">Waiting for the other computer.</p>
        <Countdown startedAt={startedAt} />
        <div>
          <Button
            variant="outline"
            disabled={leave.isPending}
            onClick={() => {
              onCancelled()
              leave.mutate()
            }}
          >
            Cancel
          </Button>
        </div>
        {leave.error ? (
          <p role="alert" className="text-sm text-destructive">
            {leave.error.message}
          </p>
        ) : null}
      </section>
    )
  }

  const busy = host.isPending || session.state === "connecting"

  return (
    <section
      aria-labelledby="host-title"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <h2 id="host-title" className="text-sm font-semibold">
        Host
      </h2>
      <p className="text-muted-foreground">
        Show a code. Type it on the other computer.
      </p>
      <div>
        <Button
          disabled={!enabled || busy}
          onClick={() =>
            host.mutate(undefined, { onSuccess: () => onHosted(Date.now()) })
          }
        >
          {host.isPending ? "Making a code…" : "Show a code"}
        </Button>
      </div>
      {host.error ? (
        <p role="alert" className="text-sm text-destructive">
          {host.error.message}
        </p>
      ) : null}
    </section>
  )
}

function Code({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex items-center gap-3">
      <p
        aria-label={`Code ${code.split("").join(" ")}`}
        className="font-mono text-4xl font-semibold tracking-widest tabular-nums"
      >
        {formatCode(code)}
      </p>
      <Button
        variant="outline"
        onClick={() => {
          void navigator.clipboard
            .writeText(code)
            .then(() => {
              setCopied(true)
              announce("Copied")
            })
            .catch(() => announce("Could not copy. Select the code instead."))
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}

function Countdown({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (startedAt === null) return

    // One tick a second only moves the clock; it never fetches anything.
    const timer = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(timer)
  }, [startedAt])

  // ponytail: after a reload the start time is unknown. Upgrade: `expiresAt`
  // in the host state, which needs a Go change.
  if (startedAt === null) {
    return (
      <p className="text-sm text-muted-foreground">Expires within 10 minutes</p>
    )
  }

  const left = CODE_LIFETIME_MS - (now - startedAt)

  return (
    <p className="text-sm text-muted-foreground tabular-nums">
      {left > 0 ? `Expires in ${formatCountdown(left)}` : "This code ran out."}
    </p>
  )
}
