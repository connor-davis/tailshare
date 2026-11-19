import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CHANNELS } from "../shared/ipc-schema"

const source = readFileSync(join(import.meta.dirname, "index.ts"), "utf8")

describe("preload bridge", () => {
  it("uses the same channel names as main", () => {
    for (const channel of Object.values(CHANNELS)) {
      expect(source).toContain(`"${channel}"`)
    }
  })

  it("exposes only the three bridge methods, never ipcRenderer", () => {
    const exposed = [...source.matchAll(/exposeInMainWorld\("(\w+)", (\w+)\)/g)]

    expect(exposed.map((m) => [m[1], m[2]])).toEqual([["tailshare", "bridge"]])
    expect(source).not.toMatch(/exposeInMainWorld\("\w+", ipcRenderer/)
    for (const name of [
      "getConnectionInfo",
      "chooseFolder",
      "onSidecarStatus",
    ]) {
      expect(source).toContain(`${name}:`)
    }
  })
})
