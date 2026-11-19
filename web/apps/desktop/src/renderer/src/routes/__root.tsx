import { createRootRoute, Outlet } from "@tanstack/react-router"
import { SidecarBanner } from "@/components/sidecar-banner"
import { StatusRegion } from "@/components/status-region"
import { useLive } from "@/lib/live/use-live"

/** The shared frame: engine banner, live text region and the routes. */
export const Route = createRootRoute({ component: Root })

function Root() {
  const sidecar = useLive()

  return (
    <div className="flex h-screen flex-col">
      <SidecarBanner {...sidecar} />
      <div className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </div>
      <StatusRegion />
    </div>
  )
}
