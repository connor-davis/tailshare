import { useState } from "react"
import { UserMinusIcon } from "lucide-react"
import { DragBar } from "@/components/drag-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useRemoveMember } from "@/lib/api/session"
import type { SessionMember, SessionState } from "@/lib/api/types"
import { ConfirmDialog } from "./confirm-dialog"
import { JoinRequest } from "./join-request"

/** How a member is named: "You", "You (host)" or their own name. */
function label(member: SessionMember): string {
  if (member.you) return member.host ? "You (host)" : "You"

  return member.displayName
}

/**
 * The right column: who is in the room, with the host marked in words, and
 * the one person waiting to be let in. The host can remove anyone else.
 */
export function MembersPanel({
  session,
  embedded = false,
}: {
  session: SessionState
  embedded?: boolean
}) {
  const members = session.members ?? []
  const remove = useRemoveMember()
  const [target, setTarget] = useState<SessionMember | null>(null)
  const isHost = session.role === "host"

  const close = () => {
    setTarget(null)
    remove.reset()
  }

  return (
    <aside
      aria-label="Members"
      className="flex h-full min-h-0 flex-col bg-card"
    >
      {embedded ? (
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          {members.length} of 8 seats
        </p>
      ) : (
        <DragBar reserveCaption className="pl-3">
          <h2 className="text-sm font-semibold">
            Members
            <span className="ml-2 font-normal text-muted-foreground tabular-nums">
              {members.length}
            </span>
          </h2>
        </DragBar>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-3 py-2">
          {session.join && isHost ? (
            <JoinRequest key={session.join.id} join={session.join} />
          ) : null}
          {members.length === 0 ? (
            <p className="text-muted-foreground">Nobody here yet</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li key={member.id} className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    <span title={member.displayName}>{label(member)}</span>
                    {member.you ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {member.displayName}
                      </span>
                    ) : null}
                    {member.fingerprint ? (
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {member.fingerprint}
                      </span>
                    ) : null}
                  </span>
                  {member.host && !member.you ? (
                    <Badge variant="secondary">Host</Badge>
                  ) : null}
                  {isHost && !member.you && !member.host ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${member.displayName}`}
                      onClick={() => setTarget(member)}
                    >
                      <UserMinusIcon aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title={`Remove ${target?.displayName ?? "this person"}?`}
        description="They are taken out of the room. They can ask to join again with the code."
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={remove.isPending}
        error={remove.error?.message}
        onConfirm={() => {
          if (target) remove.mutate(target.id, { onSuccess: close })
        }}
      />
    </aside>
  )
}
