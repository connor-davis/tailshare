import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { openSettings } from "./settings"

const directories: string[] = []
function directory() {
  const path = mkdtempSync(join(tmpdir(), "tailshare-settings-"))
  directories.push(path)
  return path
}
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true })
})

describe("settings", () => {
  it("defaults to stable without creating a file", () => {
    const path = directory()
    expect(openSettings(path).get()).toEqual({ updateChannel: "latest" })
    expect(readdirSync(path)).toEqual([])
  })

  it.each([
    "{",
    "null",
    "[]",
    '{"updateChannel":"other"}',
    '{"updateChannel":42}',
  ])("recovers from %s", (contents) => {
    const path = directory()
    writeFileSync(join(path, "settings.json"), contents)
    expect(openSettings(path).get().updateChannel).toBe("latest")
  })

  it("atomically saves only preferences and reloads them", () => {
    const path = join(directory(), "nested")
    const settings = openSettings(path)
    expect(settings.setUpdateChannel("nightly")).toEqual({
      updateChannel: "nightly",
    })
    expect(openSettings(path).get().updateChannel).toBe("nightly")
    expect(
      JSON.parse(readFileSync(join(path, "settings.json"), "utf8"))
    ).toEqual({ updateChannel: "nightly" })
    expect(readdirSync(path)).toEqual(["settings.json"])
    const copy = settings.get() as { updateChannel: string }
    copy.updateChannel = "latest"
    expect(settings.get().updateChannel).toBe("nightly")
  })

  it("retains the old setting and removes its temporary file when replacement fails", () => {
    const path = directory()
    const settings = openSettings(path)
    mkdirSync(join(path, "settings.json"))
    expect(() => settings.setUpdateChannel("nightly")).toThrow("could not save")
    expect(settings.get().updateChannel).toBe("latest")
    expect(readdirSync(path)).toEqual(["settings.json"])
  })
})
