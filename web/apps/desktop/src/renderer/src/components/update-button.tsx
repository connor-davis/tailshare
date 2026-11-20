import { useState } from "react"
import { RotateCwIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { UpdateRelease } from "./update-release"
import { useUpdateActions, useUpdateStatus } from "./use-update-status"

/**
 * The update corner of the middle column's top bar: "Update available" with
 * its release notes dialog, the download progress, then a restart icon once
 * the update is ready.
 */
export function UpdateButton() {
  const { status } = useUpdateStatus()
  const actions = useUpdateActions()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const available =
    status?.state === "available" && !dismissed.has(status.version ?? "")

  return (
    <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
      {available ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Update available
        </Button>
      ) : null}
      {status?.state === "downloading" ? (
        <Progress
          className="mx-2 w-28"
          aria-label="Update download"
          value={status.percent ?? 0}
        />
      ) : null}
      {status?.state === "ready" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-primary hover:text-primary"
              aria-label="Restart to update"
              disabled={actions.pending === "restart"}
              onClick={() => void actions.restart()}
            >
              <RotateCwIcon aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {actions.error ||
              `Restart to update to ${status.version ?? "the new version"}`}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <Dialog
        open={open && status?.state === "available"}
        onOpenChange={setOpen}
      >
        <DialogContent className="p-6 [-webkit-app-region:no-drag]">
          <DialogHeader className="pr-8">
            <DialogTitle>What's new in {status?.version}</DialogTitle>
            <DialogDescription>
              Review the changes before downloading this update.
            </DialogDescription>
          </DialogHeader>
          {status?.state === "available" ? (
            <UpdateRelease key={status.version} status={status} />
          ) : null}
          {actions.error ? (
            <Alert variant="destructive">
              <AlertDescription>{actions.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDismissed((versions) =>
                  new Set(versions).add(status?.version ?? "")
                )
                setOpen(false)
              }}
            >
              Not now
            </Button>
            <Button
              disabled={actions.pending === "download"}
              onClick={() => void actions.download()}
            >
              {actions.pending === "download"
                ? "Starting download…"
                : "Download"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
