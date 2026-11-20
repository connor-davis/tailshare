import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TitleBar } from "@/components/title-bar"
import { SidecarBanner } from "@/components/sidecar-banner"
import { StatusRegion } from "@/components/status-region"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useLive } from "@/lib/live/use-live"
import { useWindowState } from "@/lib/window-state"

/** The shared frame: title bar, engine banner, live text region and the routes. */
export const Route = createRootRoute({ component: Root })

function Root() {
  const sidecar = useLive()
  useWindowState()

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        <TitleBar />
        <SidecarBanner {...sidecar} />
        <ScrollArea className="min-h-0 flex-1">
          <Outlet />
        </ScrollArea>
        <StatusRegion />
      </div>
    </TooltipProvider>
  )
}
