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
  const { maximized } = useWindowState()

  return (
    // A maximised frameless window overhangs the screen by 8 px on each edge.
    <TooltipProvider>
      <div className={`flex h-screen flex-col ${maximized ? "p-2" : ""}`}>
        <TitleBar maximized={maximized} />
        <SidecarBanner {...sidecar} />
        <ScrollArea className="min-h-0 flex-1">
          <Outlet />
        </ScrollArea>
        <StatusRegion />
      </div>
    </TooltipProvider>
  )
}
