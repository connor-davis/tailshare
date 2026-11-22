import { useT } from "@/i18n/provider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { JoinForm } from "./join-form"

/** A small dialog to join a room by code or link, opened from the sidebar. */
export function JoinDialog({
  open,
  onOpenChange,
  enabled,
  busy,
  onJoin,
}: {
  /** True while the dialog is shown. */
  open: boolean
  /** Called when the dialog asks to open or close. */
  onOpenChange: (open: boolean) => void
  /** False while another room is open. */
  enabled: boolean
  /** True while a host or join is running. */
  busy: boolean
  /** Joins with the bare code. */
  onJoin: (code: string) => void
}) {
  const t = useT()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 p-6">
        <DialogTitle>{t("joinDialog.joinARoom")}</DialogTitle>
        <DialogDescription>
          {t("joinDialog.typeTheCodeYourFriendSentOr")}
        </DialogDescription>
        <JoinForm
          id="join-dialog-input"
          enabled={enabled}
          busy={busy}
          onJoin={(code) => {
            onOpenChange(false)
            onJoin(code)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
