import { useT } from "@/i18n/provider"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAllowJoin, useDenyJoin, useTrustJoin } from "@/lib/api/session"
import type { SessionState } from "@/lib/api/types"

/** A local decision for one person waiting to enter the share. */
export function JoinRequest({
  join,
}: {
  join: NonNullable<SessionState["join"]>
}) {
  const t = useT()

  const allow = useAllowJoin()
  const deny = useDenyJoin()
  const trust = useTrustJoin()
  const busy = allow.isPending || deny.isPending || trust.isPending
  const error = allow.error ?? deny.error ?? trust.error
  return (
    <Card
      role="region"
      aria-labelledby="join-request-title"
      className="rounded-lg border ring-0"
    >
      <CardHeader>
        <CardTitle id="join-request-title" role="heading" aria-level={2}>
          {t("joinRequest.someoneWantsToJoin")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="break-words" dir="auto">
          {join.displayName}
        </p>
        {join.fingerprint ? (
          <p className="text-xs text-muted-foreground">
            {t("joinRequest.fingerprint")}
            <span className="font-mono">{join.fingerprint}</span>
          </p>
        ) : null}
        <p className="text-muted-foreground">
          {t("joinRequest.letThisComputerIntoTheRoom")}
        </p>
        <div className="flex flex-wrap gap-2" aria-busy={busy}>
          <Button disabled={busy} onClick={() => allow.mutate(join.id)}>
            {allow.isPending
              ? t("joinRequest.allowing")
              : t("joinRequest.allow")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => deny.mutate(join.id)}
          >
            {deny.isPending ? t("joinRequest.denying") : t("joinRequest.deny")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            aria-describedby="trust-help"
            onClick={() => trust.mutate(join.id)}
          >
            {trust.isPending
              ? t("joinRequest.trusting")
              : t("joinRequest.trustThisComputer")}
          </Button>
        </div>
        <p id="trust-help" className="text-xs text-muted-foreground">
          {t("joinRequest.trustedComputersSkipThisQuestionNextTime")}
        </p>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
