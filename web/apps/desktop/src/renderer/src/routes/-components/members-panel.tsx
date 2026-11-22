import { useT } from "@/i18n/provider"
import { t } from "../../i18n/index"
import { useRef, useState } from "react"
import { announce } from "@/components/status-region"
import { UserMinusIcon } from "lucide-react"
import { DragBar } from "@/components/drag-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useRemoveMember } from "@/lib/api/session"
import type { SessionMember, SessionState } from "@/lib/api/types"
import { ConfirmDialog } from "./confirm-dialog"
import { JoinRequest } from "./join-request"

/** How a member is named: t("common.you"), "You (host)" or their own name. */
function label(member: SessionMember): string {
  if (member.you)
    return member.host ? t("membersPanel.youHost") : t("membersPanel.you")

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
  const t = useT()

  const members = session.members ?? []
  const remove = useRemoveMember()
  const [target, setTarget] = useState<SessionMember | null>(null)
  const isHost = session.role === "host"
  // The Remove button disappears with the person, so focus lands on the list.
  const list = useRef<HTMLUListElement>(null)
  const removed = useRef(false)

  const close = () => {
    setTarget(null)
    remove.reset()
  }

  return (
    <aside
      aria-label={t("membersPanel.members")}
      className="flex h-full min-h-0 flex-col bg-card"
    >
      {embedded ? (
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          {t("membersPanel.of8Seats", { length: members.length })}
        </p>
      ) : (
        <DragBar reserveCaption className="ps-3">
          <h2 className="text-sm font-semibold">
            {t("membersPanel.members")}
            <span className="ms-2 font-normal text-muted-foreground tabular-nums">
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
            <p className="text-muted-foreground">
              {t("membersPanel.nobodyHereYet")}
            </p>
          ) : (
            <ul
              ref={list}
              tabIndex={-1}
              aria-label={t("membersPanel.membersList")}
              className="flex flex-col gap-2 outline-none"
            >
              {members.map((member) => (
                <li key={member.id} className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    <span title={member.displayName} dir="auto">
                      {label(member)}
                    </span>
                    {member.you ? (
                      <span
                        className="block truncate text-xs text-muted-foreground"
                        dir="auto"
                      >
                        {member.displayName}
                      </span>
                    ) : null}
                    {member.path && member.path.kind !== "unknown" ? (
                      <span className="block text-xs text-muted-foreground">
                        {member.path.kind === "direct"
                          ? t("membersPanel.direct")
                          : member.path.region
                            ? t("membersPanel.relay", {
                                region: member.path.region,
                              })
                            : t("membersPanel.relay2")}
                      </span>
                    ) : null}
                    {member.fingerprint ? (
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {member.fingerprint}
                      </span>
                    ) : null}
                  </span>
                  {member.host && !member.you ? (
                    <Badge variant="secondary">{t("membersPanel.host")}</Badge>
                  ) : null}
                  {isHost && !member.you && !member.host ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("membersPanel.remove", {
                        displayName: member.displayName,
                      })}
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
        title={t("membersPanel.confirmRemove", {
          name: target?.displayName ?? t("common.person"),
        })}
        description={t("membersPanel.theyAreTakenOutOfTheRoom")}
        confirmLabel={t("membersPanel.remove2")}
        busyLabel={t("membersPanel.removing")}
        busy={remove.isPending}
        error={remove.error?.message}
        onCloseAutoFocus={(event) => {
          if (!removed.current) return

          removed.current = false
          event.preventDefault()
          list.current?.focus()
        }}
        onConfirm={() => {
          if (!target) return

          const name = target.displayName
          remove.mutate(target.id, {
            onSuccess: () => {
              removed.current = true
              announce(t("membersPanel.wasRemoved", { name: name }))
              close()
            },
          })
        }}
      />
    </aside>
  )
}
