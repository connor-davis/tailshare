import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { UpdateRelease } from "./update-release"
import { useUpdateStatus } from "./use-update-status"

/**
 * The "Update available" button, its download progress and the release notes
 * dialog. Lives in the middle column's top bar.
 */
export function UpdateButton() {
  const { status } = useUpdateStatus()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const available =
    status?.state === "available" && !dismissed.has(status.version ?? "")

  return (
    <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
      {available ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Update available
        </Button>
      ) : null}
      {status?.state === "downloading" ? (
        <Progress
          className="w-28"
          aria-label="Update download"
          aria-valuenow={status.percent ?? 0}
          value={status.percent ?? 0}
        />
      ) : null}
      <Dialog
        open={open && status?.state === "available"}
        onOpenChange={setOpen}
      >
        <DialogContent className="p-6 [-webkit-app-region:no-drag]">
          <DialogTitle>What's new in {status?.version}</DialogTitle>
          <DialogDescription>
            Review the changes before downloading this update.
          </DialogDescription>
          {status?.state === "available" ? (
            <UpdateRelease key={status.version} status={status} />
          ) : null}
          <Button
            variant="outline"
            className="justify-self-start"
            onClick={() => {
              setDismissed((versions) =>
                new Set(versions).add(status?.version ?? "")
              )
              setOpen(false)
            }}
          >
            Not now
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
