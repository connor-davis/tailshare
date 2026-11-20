import { useState } from "react"
import { announce } from "@/components/status-region"
import { Button } from "@/components/ui/button"
import { formatCode, joinLink } from "@/lib/code-input"

/**
 * The share code with Copy code and Copy link. The link is what a friend
 * clicks to join. `compact` is the one-line form for the room header; the
 * full form is big and centred, with the buttons under the code.
 */
export function ShareCode({
  code,
  compact = false,
}: {
  /** The code, with or without its dash. */
  code: string
  /** Smaller type and buttons, for the header. */
  compact?: boolean
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null)
  const [failed, setFailed] = useState(false)
  const size = compact ? "sm" : "default"

  const copy = (kind: "code" | "link") => {
    const text = kind === "code" ? code.replace(/-/g, "") : joinLink(code)

    // Promise.resolve also covers a clipboard that throws before returning.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(() => {
        setCopied(kind)
        setFailed(false)
        announce("Copied")
      })
      .catch(() => {
        setFailed(true)
        announce("Could not copy. Select the code instead.")
      })
  }

  return (
    <div
      className={
        compact ? "flex items-center gap-2" : "flex flex-col items-center gap-4"
      }
    >
      <p
        aria-label={`Code ${code.replace(/-/g, "").split("").join(" ")}`}
        className={
          compact
            ? "font-mono text-base font-semibold tracking-widest tabular-nums"
            : "font-mono text-5xl font-semibold tracking-widest tabular-nums"
        }
      >
        {formatCode(code)}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size={size} onClick={() => copy("code")}>
          {copied === "code" ? "Copied" : "Copy code"}
        </Button>
        <Button variant="outline" size={size} onClick={() => copy("link")}>
          {copied === "link" ? "Copied" : "Copy link"}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          Could not copy. Select the code and copy it by hand.
        </p>
      ) : null}
    </div>
  )
}
