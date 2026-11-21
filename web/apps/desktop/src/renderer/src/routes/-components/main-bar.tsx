import { PanelLeftIcon, PanelRightIcon } from "lucide-react"
import { DragBar, NoDrag } from "@/components/drag-bar"
import { UpdateButton } from "@/components/update-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/**
 * The 40 px bar over the middle column: the rooms toggle on the left, the
 * update button and members toggle on the right. When the members column is
 * hidden this bar is the rightmost, so it leaves the caption corner empty.
 */
export function MainBar({
  roomsOpen,
  onToggleRooms,
  membersOpen,
  onToggleMembers,
  joinWaiting = false,
}: {
  /** True while the rooms column is shown. */
  roomsOpen: boolean
  /** Shows or hides the rooms column. */
  onToggleRooms: () => void
  /** True while the members column is shown. */
  membersOpen: boolean
  /** Shows or hides the members column. */
  onToggleMembers: () => void
  /** True while someone waits to be let in, so a hidden column still shows it. */
  joinWaiting?: boolean
}) {
  return (
    <DragBar reserveCaption={!membersOpen} className="border-b bg-card">
      <NoDrag>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Show or hide rooms"
          aria-expanded={roomsOpen}
          onClick={onToggleRooms}
        >
          <PanelLeftIcon aria-hidden />
        </Button>
      </NoDrag>
      <div className="ml-auto" />
      <UpdateButton />
      <NoDrag>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            joinWaiting
              ? "Show or hide members, someone wants to join"
              : "Show or hide members"
          }
          aria-expanded={membersOpen}
          onClick={onToggleMembers}
        >
          <PanelRightIcon aria-hidden />
          {joinWaiting && !membersOpen ? (
            <Badge
              aria-hidden
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1"
            >
              1
            </Badge>
          ) : null}
        </Button>
      </NoDrag>
    </DragBar>
  )
}
