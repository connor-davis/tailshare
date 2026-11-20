import { useEffect, useState } from "react"
import { announce } from "@/components/status-region"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
      <Card
        role="region"
        aria-labelledby="host-title"
        className="rounded-lg border ring-0"
      >
        <CardHeader>
          <CardTitle id="host-title" role="heading" aria-level={2}>
            Share this code
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Code code={session.code ?? ""} />
          <p className="text-muted-foreground">
            Waiting for the other computer.
          </p>
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
            <Alert variant="destructive">
              <AlertDescription>{leave.error.message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  const busy = host.isPending || session.state === "connecting"

  return (
    <Card
      role="region"
      aria-labelledby="host-title"
      className="rounded-lg border ring-0"
    >
      <CardHeader>
        <CardTitle id="host-title" role="heading" aria-level={2}>
          Host
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
          <Alert variant="destructive">
            <AlertDescription>{host.error.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
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
