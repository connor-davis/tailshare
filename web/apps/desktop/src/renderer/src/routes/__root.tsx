import { createRootRoute, Outlet } from "@tanstack/react-router"
import { SidecarBanner } from "@/components/sidecar-banner"
import { StatusRegion } from "@/components/status-region"
import { SettingsDialogProvider } from "@/components/settings/settings-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useLive } from "@/lib/live/use-live"
import { useWindowState } from "@/lib/window-state"

/** The shared frame: engine banner, live text region and the routes. */
export const Route = createRootRoute({ component: Root })

function Root() {
  const sidecar = useLive()
  useWindowState()

  return (
    <TooltipProvider>
      <SettingsDialogProvider>
        <div className="flex h-screen flex-col">
          <SidecarBanner {...sidecar} />
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
          <StatusRegion />
        </div>
      </SettingsDialogProvider>
    </TooltipProvider>
  )
}
