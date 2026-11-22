import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadIdentity } from "./identity"

const KEY = /^privkey:[0-9a-f]{64}$/
const folders: string[] = []

const folder = () => {
  const made = mkdtempSync(join(tmpdir(), "tailshare-identity-"))
  folders.push(made)

  return made
}

afterEach(() => {
  for (const made of folders.splice(0))
    rmSync(made, { recursive: true, force: true })
})

describe("loadIdentity", () => {
  it("makes a clamped key on first run and keeps it", () => {
    const directory = folder()
    const first = loadIdentity(directory)

    expect(first).toMatch(KEY)
    expect(readFileSync(join(directory, "identity.key"), "utf8").trim()).toBe(
      first
    )
    expect(loadIdentity(directory)).toBe(first)

    const raw = Buffer.from(first.slice("privkey:".length), "hex")
    expect(raw[0]! & 7).toBe(0)
    expect(raw[31]! & 128).toBe(0)
    expect(raw[31]! & 64).toBe(64)
  })

  it("gives two computers two different keys", () => {
    expect(loadIdentity(folder())).not.toBe(loadIdentity(folder()))
  })

  it("keeps a bad file as .bak and starts a new key", () => {
    const directory = folder()
    writeFileSync(join(directory, "identity.key"), "garbage")

    const made = loadIdentity(directory)

    expect(made).toMatch(KEY)
    expect(readFileSync(join(directory, "identity.key.bak"), "utf8")).toBe(
      "garbage"
    )
    expect(loadIdentity(directory)).toBe(made)
  })

  it("makes a new key after the file is deleted", () => {
    const directory = folder()
    const first = loadIdentity(directory)
    rmSync(join(directory, "identity.key"))

    expect(loadIdentity(directory)).not.toBe(first)
  })
})
