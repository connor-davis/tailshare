import { DragBar } from "@/components/drag-bar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SessionMember, SessionState } from "@/lib/api/types"
import { JoinRequest } from "./join-request"

/** How a member is named: "You", "You (host)" or their own name. */
function label(member: SessionMember): string {
  if (member.you) return member.host ? "You (host)" : "You"

  return member.displayName
}

/**
 * The right column: who is in the room, with the host marked in words, and
 * the one person waiting to be let in.
 */
export function MembersPanel({ session }: { session: SessionState }) {
  const members = session.members ?? []

  return (
    <aside
      aria-label="Members"
      className="flex h-full min-h-0 flex-col border-l bg-card"
    >
      {/* Rightmost column: it sits under the Windows caption buttons. */}
      <DragBar reserveCaption>
        <h2 className="text-sm font-semibold">
          Members
          <span className="ml-2 font-normal text-muted-foreground tabular-nums">
            {members.length}
          </span>
        </h2>
      </DragBar>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-3 py-2">
          {session.join && session.role === "host" ? (
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
                  </span>
                  {member.host && !member.you ? (
                    <Badge variant="secondary">Host</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}
