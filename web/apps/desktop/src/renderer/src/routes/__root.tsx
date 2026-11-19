import { createRootRoute, Outlet } from "@tanstack/react-router"

/** The shared outlet for the desktop's file routes. */
export const Route = createRootRoute({ component: Outlet })
