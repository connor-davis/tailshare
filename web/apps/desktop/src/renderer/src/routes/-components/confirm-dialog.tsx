import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * A yes-or-no question before something that cannot be undone. The error stays
 * inside the dialog so the answer to "why did it fail" is next to the button.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel,
  busy = false,
  error,
  onConfirm,
  onCloseAutoFocus,
}: {
  /** True while the dialog is shown. */
  open: boolean
  /** Called when the dialog asks to open or close (Cancel, Escape, X). */
  onOpenChange: (open: boolean) => void
  /** The question, in plain words. */
  title: string
  /** What happens if the person says yes. */
  description: string
  /** Label of the destructive button. */
  confirmLabel: string
  /** Label of the destructive button while the call runs. */
  busyLabel: string
  /** True while the call runs; both buttons are off. */
  busy?: boolean
  /** Plain sentence from a failed call. */
  error?: string
  /** Runs the action. */
  onConfirm: () => void
  /** Runs as the dialog closes; preventDefault to place focus yourself. */
  onCloseAutoFocus?: (event: Event) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col gap-4 p-6"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2" aria-busy={busy}>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
