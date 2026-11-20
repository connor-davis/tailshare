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
import logo from "../../../../build/logo.svg"

/**
 * The window's own title bar: logo, name and a drag area. Windows draws the
 * real minimise, maximise and close buttons over the right edge, so the bar
 * keeps 138 px free there (3 buttons of 46 px).
 */
export function TitleBar() {
  const { status } = useUpdateStatus()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const available =
    status?.state === "available" && !dismissed.has(status.version ?? "")

  return (
    <header className="flex h-8 shrink-0 items-center pr-[138px] select-none [-webkit-app-region:drag]">
      <div className="flex items-center gap-2 pl-3 text-xs font-medium">
        <img src={logo} alt="" className="size-4" />
        Tailshare
      </div>
      <div className="ml-auto flex items-center gap-2 px-3 [-webkit-app-region:no-drag]">
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
      </div>
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
    </header>
  )
}
