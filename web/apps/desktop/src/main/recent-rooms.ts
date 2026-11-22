import { randomUUID } from "node:crypto"
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import type { RecentRoom } from "../shared/bridge"
import {
  JoinCodeSchema,
  RecentRoomSchema,
  RoomFolderSchema,
} from "../shared/ipc-schema"

/** Most rooms kept. The oldest one goes first. */
const MAX_ROOMS = 20

/** A room not seen for longer than this is forgotten. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/** A refusal whose message is safe to show on screen. */
export class RecentRoomsError extends Error {}

const invalid = () =>
  new RecentRoomsError("That room is not valid. Check it and try again.")

/**
 * Opens the recent rooms list under Electron's userData folder. Only the name,
 * code, last-seen time and the room's own save folder (when the person set
 * one) are kept: never chat, members or transfers.
 * `now` is the clock, so tests can move time.
 */
export function openRecentRooms(directory: string, now = Date.now) {
  const file = join(directory, "recent-rooms.json")
  const listeners = new Set<(rooms: RecentRoom[]) => void>()

  // Drops rooms past their age. A time in the future (clock moved back) is kept.
  const fresh = (rooms: readonly RecentRoom[]) =>
    rooms.filter((room) => now() - room.lastSeen <= MAX_AGE_MS)

  function load(): RecentRoom[] {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"))
    } catch (error) {
      // A missing file is a fresh start; a broken one is set aside below.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      parsed = null
    }

    const entries = (parsed as { rooms?: unknown } | null)?.rooms
    if (!Array.isArray(entries)) {
      // Keep the bad file so nothing is lost, and start empty.
      try {
        renameSync(file, `${file}.bak`)
      } catch {
        // Still better to run empty than to stop sharing.
      }
      return []
    }

    // Entry by entry: one bad record must not drop the rest.
    const seen = new Set<string>()
    const rooms: RecentRoom[] = []
    for (const entry of entries) {
      try {
        const room = Schema.decodeUnknownSync(RecentRoomSchema)(entry)
        if (seen.has(room.code)) continue
        seen.add(room.code)
        rooms.push(room)
      } catch {
        // Drops this record only.
      }
    }
    return fresh(rooms).slice(0, MAX_ROOMS)
  }

  function save(next: RecentRoom[]) {
    const temporary = `${file}.${randomUUID()}.tmp`

    try {
      mkdirSync(directory, { recursive: true })
      writeFileSync(temporary, JSON.stringify({ rooms: next }) + "\n", {
        flag: "wx",
        mode: 0o600,
      })
      renameSync(temporary, file)
    } catch {
      throw new RecentRoomsError(
        "Tailshare could not save your recent rooms. Try again."
      )
    } finally {
      rmSync(temporary, { force: true })
    }

    current = next
    for (const listener of listeners) listener([...next])
  }

  let current = load()

  return {
    /** The saved rooms, newest first, without any past their age. */
    get: (): RecentRoom[] => fresh(current),

    /**
     * Saves a room on join or leave: stamps it now and moves it to the front.
     * One code keeps one entry; a new name replaces the old one.
     */
    touch(input: unknown): RecentRoom[] {
      const raw = input as { name?: unknown; code?: unknown } | null
      if (!raw || typeof raw !== "object") throw invalid()

      let room: RecentRoom
      try {
        room = Schema.decodeUnknownSync(RecentRoomSchema)({
          name: typeof raw.name === "string" ? raw.name.trim() : raw.name,
          code: raw.code,
          lastSeen: now(),
        })
      } catch {
        throw invalid()
      }

      // Joining again must not forget where this room's downloads go.
      const saveFolder = fresh(current).find(
        (one) => one.code === room.code
      )?.saveFolder
      if (saveFolder) room = { ...room, saveFolder }

      save(
        [room, ...fresh(current).filter((one) => one.code !== room.code)].slice(
          0,
          MAX_ROOMS
        )
      )
      return [...current]
    },

    /** The folder this room's downloads go to, or `undefined` for the default. */
    folderFor: (code: string): string | undefined =>
      fresh(current).find((room) => room.code === code)?.saveFolder,

    /**
     * Sets, or with `null` clears, the folder for one room. A room that is not
     * in the list yet is added under `name`, since the folder belongs to it.
     */
    setFolder(code: unknown, folder: unknown, name: unknown): RecentRoom[] {
      let wanted: { code: string; folder: string | null }
      try {
        wanted = Schema.decodeUnknownSync(RoomFolderSchema)({ code, folder })
      } catch {
        throw invalid()
      }

      const known = fresh(current).find((room) => room.code === wanted.code)
      if (!known && wanted.folder === null) return [...current]

      let room: RecentRoom
      try {
        room = Schema.decodeUnknownSync(RecentRoomSchema)({
          name: known?.name ?? name,
          code: wanted.code,
          lastSeen: now(),
          ...(wanted.folder === null ? {} : { saveFolder: wanted.folder }),
        })
      } catch {
        throw invalid()
      }

      save(
        [room, ...fresh(current).filter((one) => one.code !== room.code)].slice(
          0,
          MAX_ROOMS
        )
      )
      return [...current]
    },

    /** Forgets one room by code. An unknown code changes nothing. */
    remove(code: unknown): RecentRoom[] {
      try {
        Schema.decodeUnknownSync(JoinCodeSchema)(code)
      } catch {
        throw invalid()
      }

      if (current.some((room) => room.code === code))
        save(fresh(current).filter((room) => room.code !== code))
      return [...current]
    },

    /** Calls `listener` with the new list after each saved change. */
    onChange(listener: (rooms: RecentRoom[]) => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

/** The recent rooms boundary used by main and IPC. */
export type RecentRoomsStore = ReturnType<typeof openRecentRooms>
