import { useState } from "react"
import { announce } from "@/components/status-region"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
    <Card
      role="region"
      aria-labelledby="join-title"
      aria-busy={busy}
      className="rounded-lg border ring-0"
    >
      <CardHeader>
        <CardTitle id="join-title" role="heading" aria-level={2}>
          Join
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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
          <Alert variant="destructive">
            <AlertDescription>{join.error.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
