import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { isJoinCode, isRecentRooms, isUpdateStatus } from "../shared/bridge"
import { CHANNELS } from "../shared/ipc-schema"

const source = readFileSync(join(import.meta.dirname, "index.ts"), "utf8")

describe("preload bridge", () => {
  it("uses the same channel names as main", () => {
    for (const channel of Object.values(CHANNELS)) {
      expect(source).toContain(`"${channel}"`)
    }
  })

  it("exposes the typed bridge methods, never ipcRenderer", () => {
    const exposed = [...source.matchAll(/exposeInMainWorld\("(\w+)", (\w+)\)/g)]

    expect(exposed.map((m) => [m[1], m[2]])).toEqual([["tailshare", "bridge"]])
    expect(source).not.toMatch(/exposeInMainWorld\("\w+", ipcRenderer/)
    for (const name of [
      "getConnectionInfo",
      "chooseFolder",
      "onSidecarStatus",
      "getSettings",
      "updateSettings",
      "onSettingsChanged",
      "getUpdateStatus",
      "onUpdateStatus",
      "checkForUpdates",
      "downloadUpdate",
      "openReleaseLink",
      "restartToUpdate",
      "getWindowState",
      "onWindowState",
      "onJoinLink",
      "getRecentRooms",
      "touchRecentRoom",
      "removeRecentRoom",
      "onRecentRoomsChanged",
    ]) {
      expect(source).toContain(`${name}:`)
    }
  })
})

describe("preload checks for join links and recent rooms", () => {
  it("lets only a bare uppercase code through", () => {
    expect(isJoinCode("7K3Q9PXM")).toBe(true)
    for (const bad of ["7k3q9pxm", "7K3Q-9PXM", "7K3Q9PXU", "", 5, null])
      expect(isJoinCode(bad)).toBe(false)
  })

  it("lets only a well-formed room list through", () => {
    const room = { name: "A", code: "7K3Q9PXM", lastSeen: 1 }

    expect(isRecentRooms([])).toBe(true)
    expect(isRecentRooms([room])).toBe(true)
    for (const bad of [
      null,
      {},
      [null],
      [{ ...room, code: "nope" }],
      [{ ...room, name: 1 }],
      [{ ...room, lastSeen: "1" }],
    ])
      expect(isRecentRooms(bad)).toBe(false)
  })

  it("sends ready only after the join-link listener is attached", () => {
    const body = source.slice(source.indexOf("onJoinLink:"))

    expect(body.indexOf('ipcRenderer.on("tailshare:join-link"')).toBeLessThan(
      body.indexOf('ipcRenderer.send("tailshare:renderer-ready")')
    )
  })

  it("subscribes and unsubscribes on the exact channels", () => {
    for (const channel of ["join-link", "recent-rooms-changed"]) {
      expect(source).toContain(`ipcRenderer.on("tailshare:${channel}"`)
      expect(source).toContain(`ipcRenderer.off("tailshare:${channel}"`)
    }
  })
})

describe("preload update validation", () => {
  it("requires a version and bounded text for an available release", () => {
    expect(
      isUpdateStatus({ state: "available", version: "1.0.1", notes: "Changes" })
    ).toBe(true)
    for (const value of [
      { state: "available" },
      { state: "available", version: 1, notes: "Changes" },
      { state: "available", version: "1.0.1", notes: {} },
      { state: "available", version: "1.0.1", notes: "x".repeat(20_001) },
    ])
      expect(isUpdateStatus(value)).toBe(false)
  })
})
