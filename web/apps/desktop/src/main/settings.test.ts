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
import { afterEach, describe, expect, it, vi } from "vitest"
import { defaultSettings, openSettings } from "./settings"

const machine = { downloads: "C:\\Users\\me\\Downloads", computerName: "BOX" }
const directories: string[] = []
function directory() {
  const path = mkdtempSync(join(tmpdir(), "tailshare-settings-"))
  directories.push(path)
  return path
}
const open = (path: string) => openSettings(path, machine)
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true })
})

describe("settings", () => {
  it("starts with the defaults and creates no file", () => {
    const path = directory()
    expect(open(path).get()).toEqual({
      updateChannel: "latest",
      relayRegion: "303",
      displayName: "BOX",
      saveMode: "folder",
      saveFolder: join("C:\\Users\\me\\Downloads", "Tailshare"),
      uploadLimitKiB: 0,
      downloadLimitKiB: 0,
      transfersAtOnce: 2,
      startWithWindows: false,
      explorerMenu: true,
      closeToTray: false,
      mica: true,
      theme: "system",
      notifications: true,
      trustedComputers: [],
    })
    expect(readdirSync(path)).toEqual([])
  })

  it("saves trusted computers, keeps them after a restart, and skips bad ones", () => {
    const path = directory()
    const entry = {
      key: `nodekey:${"a".repeat(64)}`,
      label: "Pat",
      addedAt: 1,
      fingerprint: "0123456789ab",
    }

    open(path).update({ trustedComputers: [entry] })
    expect(open(path).get().trustedComputers).toEqual([entry])

    for (const bad of [
      [{ ...entry, key: "nodekey:short" }],
      [{ ...entry, label: "" }],
      [{ ...entry, fingerprint: "xyz" }],
      Array.from({ length: 101 }, () => entry),
    ])
      expect(() => open(path).update({ trustedComputers: bad })).toThrow(
        "not valid"
      )

    // A bad saved list falls back to nobody trusted, other fields stay.
    writeFileSync(
      join(path, "settings.json"),
      JSON.stringify({ theme: "dark", trustedComputers: [{ key: "x" }] })
    )
    expect(open(path).get()).toMatchObject({
      theme: "dark",
      trustedComputers: [],
    })
  })

  it("cuts a long computer name to 64 characters", () => {
    expect(
      defaultSettings({ computerName: "x".repeat(80) }).displayName
    ).toHaveLength(64)
  })

  it("loads the 0.1.0 file that only has the update channel", () => {
    const path = directory()
    writeFileSync(join(path, "settings.json"), '{"updateChannel":"nightly"}')
    expect(open(path).get()).toEqual({
      ...defaultSettings(machine),
      updateChannel: "nightly",
    })
  })

  it.each(["{", "null", "[]", "42"])(
    "starts from defaults and keeps %s as settings.json.bak",
    (contents) => {
      const path = directory()
      writeFileSync(join(path, "settings.json"), contents)
      expect(open(path).get()).toEqual(defaultSettings(machine))
      expect(readdirSync(path)).toEqual(["settings.json.bak"])
      expect(readFileSync(join(path, "settings.json.bak"), "utf8")).toBe(
        contents
      )
    }
  )

  it("drops unknown keys and defaults a bad value without losing the rest", () => {
    const path = directory()
    writeFileSync(
      join(path, "settings.json"),
      JSON.stringify({
        mica: false,
        transfersAtOnce: 99,
        saveFolder: "relative",
        extra: 1,
      })
    )
    const loaded = open(path).get()
    expect(loaded.mica).toBe(false)
    expect(loaded.transfersAtOnce).toBe(2)
    expect(loaded.saveFolder).toBe(defaultSettings(machine).saveFolder)
    expect("extra" in loaded).toBe(false)
  })

  it("saves a patch atomically, tells listeners and reloads it", () => {
    const path = join(directory(), "nested")
    const settings = open(path)
    const listener = vi.fn()
    settings.onChange(listener)

    const next = settings.update({
      updateChannel: "nightly",
      closeToTray: true,
    })

    expect(next.updateChannel).toBe("nightly")
    expect(listener).toHaveBeenCalledWith(next, defaultSettings(machine))
    expect(open(path).get()).toEqual(next)
    expect(readdirSync(path)).toEqual(["settings.json"])
    ;(settings.get() as { mica: boolean }).mica = false
    expect(settings.get().mica).toBe(true)
  })

  it("trims the display name and treats blank as the computer name", () => {
    const settings = open(directory())
    expect(settings.update({ displayName: "  Ana  " }).displayName).toBe("Ana")
    expect(settings.update({ displayName: "   " }).displayName).toBe("BOX")
  })

  it.each([
    ["a name of 65 characters", { displayName: "x".repeat(65) }],
    ["speed -1", { uploadLimitKiB: -1 }],
    ["speed over the limit", { downloadLimitKiB: 1048577 }],
    ["speed NaN", { uploadLimitKiB: NaN }],
    ["a fractional speed", { uploadLimitKiB: 1.5 }],
    ["0 transfers", { transfersAtOnce: 0 }],
    ["9 transfers", { transfersAtOnce: 9 }],
    ["a relative folder", { saveFolder: "Downloads\\Tailshare" }],
    ["a drive-less folder", { saveFolder: "\\Tailshare" }],
    ["an empty folder", { saveFolder: "" }],
    ["a folder over 4096 chars", { saveFolder: "C:\\" + "a".repeat(4094) }],
    ["a bad save mode", { saveMode: "sometimes" }],
    ["a bad channel", { updateChannel: "beta" }],
    ["a bad theme", { theme: "sepia" }],
    ["a string for a flag", { mica: "yes" }],
    ["a number for notifications", { notifications: 1 }],
    ["an unknown key", { colour: "red" }],
  ])("refuses %s whole, with no write and no listener", (_name, patch) => {
    const path = directory()
    const settings = open(path)
    const listener = vi.fn()
    settings.onChange(listener)

    // The valid field rides along: it must not be applied either.
    expect(() => settings.update({ closeToTray: true, ...patch })).toThrow(
      "not valid"
    )

    expect(settings.get()).toEqual(defaultSettings(machine))
    expect(listener).not.toHaveBeenCalled()
    expect(readdirSync(path)).toEqual([])
  })

  it.each([[[]], [null], ["x"]])("refuses %j as a patch", (patch) => {
    expect(() => open(directory()).update(patch)).toThrow("not valid")
  })

  it("accepts UNC folders and the top of every range", () => {
    const next = open(directory()).update({
      saveFolder: "\\\\nas\\share\\in",
      uploadLimitKiB: 1048576,
      transfersAtOnce: 8,
    })
    expect(next.saveFolder).toBe("\\\\nas\\share\\in")
  })

  it("keeps the old settings and leaves no temp file when the rename fails", () => {
    const path = directory()
    const settings = open(path)
    const listener = vi.fn()
    settings.onChange(listener)
    mkdirSync(join(path, "settings.json"))

    expect(() => settings.update({ mica: false })).toThrow("could not save")

    expect(settings.get().mica).toBe(true)
    expect(listener).not.toHaveBeenCalled()
    expect(readdirSync(path)).toEqual(["settings.json"])
  })
})
