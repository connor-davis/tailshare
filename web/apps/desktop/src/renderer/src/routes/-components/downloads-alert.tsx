import { useT } from "@/i18n/provider"
import { useState } from "react"
import { announce } from "@/components/status-region"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useDownloadsOk } from "@/components/use-downloads-status"

/**
 * Shown over the room while the save folder cannot be used. Downloads stay off
 * until a folder works, and the button asks for another one in place.
 */
export function DownloadsAlert() {
  const t = useT()

  const ok = useDownloadsOk()
  const [failed, setFailed] = useState(false)

  if (ok) return null

  const choose = async () => {
    setFailed(false)

    try {
      const picked = await window.tailshare.chooseFolder()
      if (picked) {
        await window.tailshare.updateSettings({ saveFolder: picked })
        announce(t("downloadsAlert.checkingTheNewFolder"))
      }
    } catch {
      setFailed(true)
    }
  }

  return (
    <Alert
      role="status"
      variant="destructive"
      className="flex items-center gap-3 rounded-none border-x-0 border-t-0"
    >
      <AlertDescription className="flex-1">
        {failed
          ? t("downloadsAlert.couldNotChangeTheFolderTryAgain")
          : t("downloadsAlert.downloadsAreOffBecauseTailshareCannotUse")}
      </AlertDescription>
      <Button size="sm" variant="outline" onClick={() => void choose()}>
        {t("downloadsAlert.chooseAnotherFolder")}
      </Button>
    </Alert>
  )
}
