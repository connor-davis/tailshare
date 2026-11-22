import { useT } from "@/i18n/provider"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** The longest label the sidecar accepts. */
const maxLabel = 64

/**
 * Asks for a port and a name, then shares that app with the room. The form
 * is mounted only while open, so it starts empty every time.
 */
export function ShareAppDialog({
  open,
  onOpenChange,
  busy,
  error,
  onShare,
}: {
  /** True while the dialog is shown. */
  open: boolean
  /** Called when the dialog asks to open or close. */
  onOpenChange: (open: boolean) => void
  /** True while the share call runs. */
  busy: boolean
  /** Plain sentence when the last share failed. */
  error?: string
  /** Shares the app. */
  onShare: (port: number, label: string) => void
}) {
  const t = useT()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 p-6">
        <DialogTitle>{t("shareAppDialog.shareAnApp")}</DialogTitle>
        <DialogDescription>
          {t("shareAppDialog.everyoneInTheRoomCanOpenIt")}
        </DialogDescription>
        <ShareForm
          busy={busy}
          error={error}
          onShare={onShare}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

// Mounted only while the dialog is open, so the boxes start empty every time.
function ShareForm({
  busy,
  error,
  onShare,
  onCancel,
}: {
  busy: boolean
  error?: string
  onShare: (port: number, label: string) => void
  onCancel: () => void
}) {
  const t = useT()

  const [port, setPort] = useState("")
  const [label, setLabel] = useState("")
  const number = Number(port)
  const valid =
    /^[0-9]{1,5}$/.test(port) &&
    number >= 1 &&
    number <= 65535 &&
    label.trim() !== ""

  return (
    <form
      className="flex flex-col gap-4 text-start"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid && !busy) onShare(number, label.trim())
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="share-app-port">{t("shareAppDialog.port")}</Label>
        <Input
          id="share-app-port"
          inputMode="numeric"
          value={port}
          placeholder="3000"
          maxLength={5}
          onChange={(event) => setPort(event.target.value.trim())}
          autoComplete="off"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="share-app-label">{t("shareAppDialog.name")}</Label>
        <Input
          id="share-app-label"
          value={label}
          placeholder={t("shareAppDialog.devServer")}
          maxLength={maxLabel}
          onChange={(event) => setLabel(event.target.value)}
          autoComplete="off"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("shareAppDialog.cancel")}
        </Button>
        <Button type="submit" disabled={!valid || busy}>
          {t("shareAppDialog.share")}
        </Button>
      </div>
    </form>
  )
}
