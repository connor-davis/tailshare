import { useEffect, useState } from "react"
import { formatCountdown } from "@/lib/format"

/**
 * How long the share code still works. The sidecar sends the end time, so a
 * reload shows the same count.
 */
export function CodeCountdown({ expiresAt }: { expiresAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  const end = expiresAt ? Date.parse(expiresAt) : NaN

  useEffect(() => {
    if (Number.isNaN(end)) return

    // One tick a second only moves the clock; it never fetches anything.
    const timer = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(timer)
  }, [end])

  // No end time means someone already joined, so the code is used up.
  if (Number.isNaN(end)) return <>Code used</>

  const left = end - now

  return (
    <span className="tabular-nums">
      {left > 0 ? `Expires in ${formatCountdown(left)}` : "This code ran out."}
    </span>
  )
}
