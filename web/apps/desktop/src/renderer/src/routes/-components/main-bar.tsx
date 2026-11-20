import { PanelLeftIcon, PanelRightIcon } from "lucide-react"
import { DragBar, NoDrag } from "@/components/drag-bar"
import { UpdateButton } from "@/components/update-button"
import { Button } from "@/components/ui/button"

/**
 * The 32 px bar over the middle column: the rooms toggle on the left, the
 * update button and members toggle on the right. When the members column is
 * hidden this bar is the rightmost, so it leaves the caption corner empty.
 */
export function MainBar({
  roomsOpen,
  onToggleRooms,
  membersOpen,
  onToggleMembers,
}: {
  /** True while the rooms column is shown. */
  roomsOpen: boolean
  /** Shows or hides the rooms column. */
  onToggleRooms: () => void
  /** True while the members column is shown. */
  membersOpen: boolean
  /** Shows or hides the members column. */
  onToggleMembers: () => void
}) {
  return (
    <DragBar reserveCaption={!membersOpen}>
      <NoDrag>
        <Button
          variant="ghost"
          size="icon-sm"
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
          size="icon-sm"
          aria-label="Show or hide members"
          aria-expanded={membersOpen}
          onClick={onToggleMembers}
        >
          <PanelRightIcon aria-hidden />
        </Button>
      </NoDrag>
    </DragBar>
  )
}
