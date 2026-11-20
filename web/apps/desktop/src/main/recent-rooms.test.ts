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
import { openRecentRooms } from "./recent-rooms"

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000
const directories: string[] = []

function directory() {
  const path = mkdtempSync(join(tmpdir(), "tailshare-recent-"))
  directories.push(path)
  return path
}

afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true })
})

/** A clock that tests can move. */
function clock(start = NOW) {
  let time = start
  return { now: () => time, set: (next: number) => void (time = next) }
}

const code = (n: number) => String(n).padStart(8, "0")
const room = (n: number, lastSeen = NOW) => ({
  name: `Room ${n}`,
  code: code(n),
  lastSeen,
})
const write = (path: string, data: unknown) =>
  writeFileSync(join(path, "recent-rooms.json"), JSON.stringify(data))

describe("recent rooms", () => {
  it("starts empty and creates no file", () => {
    const path = directory()

    expect(openRecentRooms(path).get()).toEqual([])
    expect(readdirSync(path)).toEqual([])
  })

  it("adds a room with the time, and trims the name", () => {
    const store = openRecentRooms(directory(), clock().now)

    store.touch({ name: "  Movies  ", code: "7K3Q9PXM" })

    expect(store.get()).toEqual([
      { name: "Movies", code: "7K3Q9PXM", lastSeen: NOW },
    ])
  })

  it("touching moves a room to the front and refreshes its time", () => {
    const time = clock()
    const store = openRecentRooms(directory(), time.now)
    store.touch({ name: "A", code: code(1) })
    store.touch({ name: "B", code: code(2) })

    time.set(NOW + 1000)
    store.touch({ name: "A", code: code(1) })

    expect(store.get().map((r) => [r.name, r.lastSeen])).toEqual([
      ["A", NOW + 1000],
      ["B", NOW],
    ])
  })

  it("keeps one entry per code and lets a new name win", () => {
    const store = openRecentRooms(directory(), clock().now)
    store.touch({ name: "Old", code: code(1) })
    store.touch({ name: "New", code: code(1) })

    expect(store.get().map((r) => r.name)).toEqual(["New"])
  })

  it("removes a room, and an unknown code changes nothing", () => {
    const store = openRecentRooms(directory(), clock().now)
    store.touch({ name: "A", code: code(1) })
    const changed = vi.fn()
    store.onChange(changed)

    store.remove(code(9))
    expect(changed).not.toHaveBeenCalled()
    expect(store.get()).toHaveLength(1)

    store.remove(code(1))
    expect(changed).toHaveBeenCalledOnce()
    expect(store.get()).toEqual([])
  })

  it("keeps the newest 20 and drops the oldest", () => {
    const time = clock()
    const store = openRecentRooms(directory(), time.now)

    for (let i = 1; i <= 21; i++) {
      time.set(NOW + i)
      store.touch({ name: `Room ${i}`, code: code(i) })
    }

    const rooms = store.get()
    expect(rooms).toHaveLength(20)
    expect(rooms[0]!.name).toBe("Room 21")
    expect(rooms.at(-1)!.name).toBe("Room 2")
  })

  it("forgets a room after 30 days but keeps it on day 30", () => {
    const path = directory()
    write(path, {
      rooms: [room(1, NOW - 30 * DAY), room(2, NOW - 30 * DAY - 1)],
    })

    expect(
      openRecentRooms(path, clock().now)
        .get()
        .map((r) => r.code)
    ).toEqual([code(1)])
  })

  it("prunes a room that ages out while the app stays open", () => {
    const time = clock()
    const store = openRecentRooms(directory(), time.now)
    store.touch({ name: "A", code: code(1) })

    time.set(NOW + 31 * DAY)
    expect(store.get()).toEqual([])

    store.touch({ name: "B", code: code(2) })
    expect(store.get().map((r) => r.name)).toEqual(["B"])
  })

  it("saves to disk and loads the same list again", () => {
    const path = directory()
    const first = openRecentRooms(path, clock().now)
    first.touch({ name: "A", code: code(1) })
    first.touch({ name: "B", code: code(2) })

    expect(openRecentRooms(path, clock().now).get()).toEqual(first.get())
    expect(readdirSync(path)).toEqual(["recent-rooms.json"])
  })

  it("stores only name, code and time", () => {
    const path = directory()
    openRecentRooms(path, clock().now).touch({
      name: "A",
      code: code(1),
      members: ["x"],
      chat: "hello",
    })

    expect(
      JSON.parse(readFileSync(join(path, "recent-rooms.json"), "utf8"))
    ).toEqual({
      rooms: [{ name: "A", code: code(1), lastSeen: NOW }],
    })
  })

  it.each([
    ["no input", null],
    ["a lowercase code", { name: "A", code: "7k3q9pxm" }],
    ["a dashed code", { name: "A", code: "7K3Q-9PXM" }],
    ["a short code", { name: "A", code: "7K3Q" }],
    ["no name", { code: "7K3Q9PXM" }],
    ["a blank name", { name: "   ", code: "7K3Q9PXM" }],
    ["a long name", { name: "x".repeat(65), code: "7K3Q9PXM" }],
    ["a number name", { name: 5, code: "7K3Q9PXM" }],
  ])("refuses %s and saves nothing", (_what, input) => {
    const path = directory()
    const store = openRecentRooms(path, clock().now)

    expect(() => store.touch(input)).toThrow("not valid")
    expect(store.get()).toEqual([])
    expect(readdirSync(path)).toEqual([])
  })

  it("refuses to remove a bad code", () => {
    expect(() => openRecentRooms(directory()).remove("nope")).toThrow(
      "not valid"
    )
  })

  it.each(["{", "null", "[]", "42", '{"rooms":5}', "{}"])(
    "sets aside a bad file (%s) as .bak and starts empty",
    (text) => {
      const path = directory()
      writeFileSync(join(path, "recent-rooms.json"), text)

      expect(openRecentRooms(path).get()).toEqual([])
      expect(readFileSync(join(path, "recent-rooms.json.bak"), "utf8")).toBe(
        text
      )
    }
  )

  it("drops bad records but keeps the good ones", () => {
    const path = directory()
    write(path, {
      rooms: [
        room(1),
        { name: "", code: code(2), lastSeen: NOW },
        { name: "x", code: "lower123", lastSeen: NOW },
        { name: "x", code: code(3), lastSeen: "soon" },
        { name: "x", code: code(4), lastSeen: 1.5 },
        { name: "x", code: code(5) },
        room(1),
        room(6),
        7,
      ],
    })

    expect(
      openRecentRooms(path, clock().now)
        .get()
        .map((r) => r.code)
    ).toEqual([code(1), code(6)])
  })

  it("keeps memory and tells nobody when the save fails", () => {
    const path = directory()
    const store = openRecentRooms(path, clock().now)
    store.touch({ name: "A", code: code(1) })
    const changed = vi.fn()
    store.onChange(changed)
    // A folder where the file belongs makes the rename fail.
    rmSync(join(path, "recent-rooms.json"))
    mkdirSync(join(path, "recent-rooms.json"))

    expect(() => store.touch({ name: "B", code: code(2) })).toThrow(
      "could not save"
    )

    expect(store.get().map((r) => r.name)).toEqual(["A"])
    expect(changed).not.toHaveBeenCalled()
    expect(readdirSync(path)).toEqual(["recent-rooms.json"])
  })

  it("tells listeners after a save, until they unsubscribe", () => {
    const store = openRecentRooms(directory(), clock().now)
    const changed = vi.fn()
    const unsubscribe = store.onChange(changed)

    store.touch({ name: "A", code: code(1) })
    expect(changed).toHaveBeenCalledWith([
      { name: "A", code: code(1), lastSeen: NOW },
    ])

    unsubscribe()
    store.touch({ name: "B", code: code(2) })
    expect(changed).toHaveBeenCalledOnce()
  })
})
