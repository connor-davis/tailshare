import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { FolderHint } from "./folder-hint"
import { JoinForm } from "./join-form"

/** A small dialog to join a room by code or link, opened from the sidebar. */
export function JoinDialog({
  open,
  onOpenChange,
  enabled,
  busy,
  folderName,
  onJoin,
}: {
  /** True while the dialog is shown. */
  open: boolean
  /** Called when the dialog asks to open or close. */
  onOpenChange: (open: boolean) => void
  /** False until a folder is chosen, or while another room is open. */
  enabled: boolean
  /** True while a host or join is running. */
  busy: boolean
  /** Base name of the shared folder, or null before one is chosen. */
  folderName: string | null
  /** Joins with the bare code. */
  onJoin: (code: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 p-6">
        <DialogTitle>Join a room</DialogTitle>
        <DialogDescription>
          Type the code your friend sent, or paste their link.
        </DialogDescription>
        <FolderHint folderName={folderName} />
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
