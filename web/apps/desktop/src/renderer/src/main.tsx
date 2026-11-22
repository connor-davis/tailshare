import { LocaleProvider } from "./i18n/provider"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createHashHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { followColorScheme } from "./lib/theme"
import "./styles/globals.css"

// Apply before the first render and follow subsequent operating-system changes.
followColorScheme(
  window.matchMedia("(prefers-color-scheme: dark)"),
  document.documentElement
)

const queryClient = new QueryClient()
const router = createRouter({ routeTree, history: createHashHistory() })

declare module "@tanstack/react-router" {
  /** Register the file routes so navigation remains type checked. */
  interface Register {
    /** The desktop router uses hashes for packaged file URLs. */
    router: typeof router
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>
  </StrictMode>
)
