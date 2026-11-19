import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

/** Tests resolve the same `@` alias as the renderer build. */
export default defineConfig({
  resolve: { alias: { "@": resolve("src/renderer/src") } },
})
