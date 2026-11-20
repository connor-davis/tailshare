import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAllowJoin, useDenyJoin } from "@/lib/api/session"
import type { SessionState } from "@/lib/api/types"

/** A local decision for one person waiting to enter the share. */
export function JoinRequest({
  join,
}: {
  join: NonNullable<SessionState["join"]>
}) {
  const allow = useAllowJoin()
  const deny = useDenyJoin()
  const busy = allow.isPending || deny.isPending
  const error = allow.error ?? deny.error
  return (
    <Card
      role="region"
      aria-labelledby="join-request-title"
      className="rounded-lg border ring-0"
    >
      <CardHeader>
        <CardTitle id="join-request-title" role="heading" aria-level={2}>
          Someone wants to join
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="break-words">{join.displayName}</p>
        <p className="text-muted-foreground">
          Let this computer into the room?
        </p>
        <div className="flex gap-2" aria-busy={busy}>
          <Button disabled={busy} onClick={() => allow.mutate(join.id)}>
            {allow.isPending ? "Allowing…" : "Allow"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => deny.mutate(join.id)}
          >
            {deny.isPending ? "Denying…" : "Deny"}
          </Button>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
