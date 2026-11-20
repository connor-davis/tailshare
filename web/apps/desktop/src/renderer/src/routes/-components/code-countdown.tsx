import { useEffect, useState } from "react"
import { formatCountdown } from "@/lib/format"

/** A code lives this long. The API has no `expiresAt`, so we count it here. */
const CODE_LIFETIME_MS = 10 * 60 * 1000

/** How long the share code still works, counted from when the room opened. */
export function CodeCountdown({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (startedAt === null) return

    // One tick a second only moves the clock; it never fetches anything.
    const timer = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(timer)
  }, [startedAt])

  // ponytail: after a reload the start time is unknown. Upgrade: `expiresAt`
  // in the host state, which needs a Go change.
  if (startedAt === null) return <>Expires within 10 minutes</>

  const left = CODE_LIFETIME_MS - (now - startedAt)

  return (
    <span className="tabular-nums">
      {left > 0 ? `Expires in ${formatCountdown(left)}` : "This code ran out."}
    </span>
  )
}
