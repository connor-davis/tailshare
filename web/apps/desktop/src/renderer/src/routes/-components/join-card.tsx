import { useState } from "react"
import { announce } from "@/components/status-region"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useJoin } from "@/lib/api/session"
import { foldCode } from "@/lib/code-input"
import { CodeInput } from "./code-input"

/** Join side of the connect screen: type the code, press Connect. */
export function JoinCard({
  enabled,
  connecting,
}: {
  /** False until a folder is chosen. */
  enabled: boolean
  /** True while the sidecar says a session is being set up. */
  connecting: boolean
}) {
  const [code, setCode] = useState("")
  const join = useJoin()
  const valid = foldCode(code) !== null
  const busy = join.isPending || connecting

  return (
    <section
      aria-labelledby="join-title"
      aria-busy={busy}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <h2 id="join-title" className="text-sm font-semibold">
        Join
      </h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || busy) return
          join.mutate(code, { onSuccess: () => announce("Connected.") })
        }}
      >
        <Label htmlFor="join-code">Code from the other computer</Label>
        <CodeInput
          value={code}
          onChange={setCode}
          disabled={!enabled || busy}
          describedBy="join-code-hint"
        />
        <div>
          <Button type="submit" disabled={!enabled || !valid || busy}>
            {busy ? "Connecting…" : "Connect"}
          </Button>
        </div>
      </form>
      {join.error ? (
        <p role="alert" className="text-sm text-destructive">
          {join.error.message}
        </p>
      ) : null}
    </section>
  )
}
