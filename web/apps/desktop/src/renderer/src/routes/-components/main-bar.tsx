import { useT } from "@/i18n/provider"
import { PanelLeftIcon } from "lucide-react"
import { DragBar, NoDrag } from "@/components/drag-bar"
import { UpdateButton } from "@/components/update-button"
import { Button } from "@/components/ui/button"

/**
 * The 40 px app toolbar keeps the rail toggle and updates reachable.
 * It always leaves the native caption corner empty.
 */
export function MainBar({
  roomsOpen,
  onToggleRooms,
}: {
  /** True while the rooms column is shown. */
  roomsOpen: boolean
  /** Shows or hides the rooms column. */
  onToggleRooms: () => void
}) {
  const t = useT()

  return (
    <DragBar reserveCaption className="border-b bg-card">
      <NoDrag>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("mainBar.showOrHideRooms")}
          aria-expanded={roomsOpen}
          onClick={onToggleRooms}
        >
          <PanelLeftIcon aria-hidden className="rtl:-scale-x-100" />
        </Button>
      </NoDrag>
      <span className="ms-2 font-semibold">{t("mainBar.tailshare")}</span>
      <div className="ms-auto" />
      <UpdateButton />
    </DragBar>
  )
}
