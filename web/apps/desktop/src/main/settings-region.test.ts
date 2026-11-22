import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { openSettings } from "./settings"

const paths: string[] = []
function directory() {
  const path = mkdtempSync(join(tmpdir(), "tailshare-region-"))
  paths.push(path)
  return path
}
afterEach(() => {
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true })
})
describe("relay region settings", () => {
  it.each(["301", "302", "303", "304", "nearest"])("persists %s", (region) => {
    const path = directory()
    const store = openSettings(path)
    expect(store.get().relayRegion).toBe("303")
    store.update({ relayRegion: region })
    expect(openSettings(path).get().relayRegion).toBe(region)
  })
  it("rejects unsupported values and falls back when reading an old bad file", () => {
    const path = directory()
    const store = openSettings(path)
    for (const value of [305, "305", "FRA", null])
      expect(() => store.update({ relayRegion: value })).toThrow()
    writeFileSync(
      join(path, "settings.json"),
      JSON.stringify({ relayRegion: "305" })
    )
    expect(openSettings(path).get().relayRegion).toBe("303")
  })
})
