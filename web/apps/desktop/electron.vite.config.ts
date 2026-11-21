import { resolve } from "node:path"
import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"

/** Build the isolated main, preload and browser targets. */
export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: { output: { format: "cjs", entryFileNames: "index.cjs" } },
    },
  },
  renderer: {
    // The sidecar allows only 5173 and 5174 (internal/api/middleware.go), so
    // never drift. A second dev copy sets TAILSHARE_DEV_PORT=5174.
    server: {
      port: process.env.TAILSHARE_DEV_PORT === "5174" ? 5174 : 5173,
      strictPort: true,
    },
    resolve: { alias: { "@": resolve("src/renderer/src") } },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: resolve("src/renderer/src/routes"),
        generatedRouteTree: resolve("src/renderer/src/routeTree.gen.ts"),
      }),
      react(),
      tailwindcss(),
    ],
  },
})
