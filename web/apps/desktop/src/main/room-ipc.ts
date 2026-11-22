import { randomUUID } from "node:crypto"
import { lstatSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { Effect } from "effect"
import type {
  AddFilesResult,
  ConnectionInfo,
  CurrentRoom,
} from "../shared/bridge"
import {
  AddedPathsSchema,
  AddFilesResultSchema,
  CHANNELS,
  CurrentRoomSchema,
  PasteResultSchema,
  RoomFolderSchema,
  StartDownloadSchema,
} from "../shared/ipc-schema"
import { check, type IpcHost } from "./ipc"

/** Main-owned dependencies; no local path or main token is returned to the page. */
export interface RoomFilesHost {
  pickFiles(): Promise<string[] | null>
  addFiles(paths: readonly string[]): Promise<AddFilesResult>
  /** Native Save dialog for one file, opened at `suggested` (a name or a full path). Null when cancelled. */
  pickSaveFile(suggested: string): Promise<string | null>
  /** The saved "where do downloads go" choice. */
  saveMode(): "folder" | "ask"
  /** The folder "Save to my folder" uses. */
  saveFolder(): string
  /** The folder this room's downloads go to, if the person set one. */
  roomSaveFolder(code: string): string | undefined
  /** Saves or clears (`null`) a room's folder; `name` is used if the room is not saved yet. */
  setRoomFolder(code: string, folder: string | null, name: string): void
  /** Notes a started download, so its finished file can be dragged or previewed. */
  remember(item: unknown, folder: string): void
  /** The clipboard. Read only when the person clicks Paste. */
  clipboard: {
    /** The picture as PNG bytes, or `null` when there is none. */
    readPng(): Promise<Buffer | null>
    /** The plain text, empty when there is none. */
    readText(): Promise<string>
  }
  /** A folder under userData where a pasted picture waits until it is copied into the room. */
  pasteDir: string
  /** Starts a download into the saved folder. */
  saveToFolder(request: { source: string; name: string }): Promise<unknown>
  /** Starts a download into a folder the person just picked. */
  saveInto(request: {
    source: string
    folder: string
    name: string
  }): Promise<unknown>
  openPath(path: string): Promise<string>
  roomsDir: string
}

/** Mirrors codes.Parse, then uses its 4+4 canonical folder name. */
export function roomFolder(roomsDir: string, value: unknown): string {
  if (typeof value !== "string") throw new Error("That room code is not valid.")
  const code = value
    .toUpperCase()
    .replace(/[- ]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(code))
    throw new Error("That room code is not valid.")
  return join(roomsDir, `${code.slice(0, 4)}-${code.slice(4)}`)
}

/** The biggest picture Paste will take, in bytes. */
const MAX_PASTE_BYTES = 25 * 1024 * 1024

/** What the person sees when a room's own folder cannot be used. */
const ROOM_FOLDER_GONE =
  "This room's save folder is missing or not a folder. Choose another one for this room."

/** Throws unless `folder` is a real folder: no `..` part and not a link (like pickedFolder in Go). */
function checkFolder(folder: string) {
  if (folder.split(/[\\/]/).includes("..")) throw new Error("bad folder")

  const info = lstatSync(folder)
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("bad folder")
}

/** A file-name-safe local time, like `2026-11-22 14-03-05`. */
function stamp() {
  const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 19).replace("T", " ").replaceAll(":", "-")
}

/** Registers consented file copying and code-only folder opening behind sender guards. */
export function registerRoomIpc(host: IpcHost, files: RoomFilesHost) {
  const refuse = () => new Error("Tailshare could not read that request.")
  // Lives as long as main, so it outlasts a reload of the page.
  let currentRoom: CurrentRoom | null = null
  // One call to the sidecar takes at most CHUNK paths, so a big drop is cut up.
  const CHUNK = 100
  const addChunk = async (paths: unknown[]) => {
    const checked = await Effect.runPromise(check(AddedPathsSchema, paths))
    return Effect.runPromise(
      check(AddFilesResultSchema, await files.addFiles(checked))
    )
  }
  const add = async (paths: unknown) => {
    if (!Array.isArray(paths))
      throw new Error("Tailshare could not add those files.")

    // A failed chunk must not hide the others: its files are reported as skipped.
    const merged: AddFilesResult = { added: [], skipped: [] }
    let failed = 0
    for (let start = 0; start < paths.length; start += CHUNK) {
      const chunk = paths.slice(start, start + CHUNK)
      try {
        const result = await addChunk(chunk)
        merged.added.push(...result.added)
        merged.skipped.push(...result.skipped)
      } catch {
        // Schema errors can include input paths, which must stay in main.
        failed += chunk.length
        merged.skipped.push({
          name: `${chunk.length} files`,
          reason: "Tailshare could not add these files.",
        })
      }
    }
    if (failed > 0 && failed === paths.length)
      throw new Error("Tailshare could not add those files.")

    return merged
  }
  // A pasted picture gets a folder of its own, so it can keep a readable name
  // and two pastes never collide. The folder is gone once the room has a copy.
  const pasteImage = async (png: Buffer) => {
    if (png.length > MAX_PASTE_BYTES)
      throw new Error("That picture is too big to paste. The limit is 25 MB.")

    const folder = join(files.pasteDir, randomUUID())
    try {
      await mkdir(folder, { recursive: true })
      const path = join(folder, `Pasted picture ${stamp()}.png`)
      await writeFile(path, png, { flag: "wx", mode: 0o600 })

      return { kind: "file" as const, result: await add([path]) }
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  }
  const remember = (item: unknown, folder: string) => {
    files.remember(item, folder)
    return item
  }
  host.handle(CHANNELS.startDownload, async (senderOk, args) => {
    if (!senderOk || args.length !== 1) throw refuse()
    let request: { source: string; name: string }
    try {
      request = await Effect.runPromise(check(StartDownloadSchema, args[0]))
    } catch {
      throw refuse()
    }

    // The room's own folder beats "Save to my folder"; "ask every time" still
    // asks, but opens in the room's folder.
    const room = currentRoom
      ? files.roomSaveFolder(currentRoom.code)
      : undefined
    if (files.saveMode() !== "ask") {
      if (!room)
        return remember(await files.saveToFolder(request), files.saveFolder())

      // Only this download fails when the room's folder is gone.
      try {
        checkFolder(room)
      } catch {
        throw new Error(ROOM_FOLDER_GONE)
      }
      return remember(await files.saveInto({ ...request, folder: room }), room)
    }

    const picked = await files.pickSaveFile(
      room ? join(room, request.name) : request.name
    )
    if (picked === null) return null

    const folder = dirname(picked)
    return remember(
      await files.saveInto({
        source: request.source,
        folder,
        name: basename(picked),
      }),
      folder
    )
  })
  host.handle(CHANNELS.pasteClipboard, async (senderOk, args) => {
    if (!senderOk || args.length !== 0) throw refuse()

    // A picture wins over text when the clipboard holds both.
    const png = await files.clipboard.readPng()
    if (png)
      return Effect.runPromise(check(PasteResultSchema, await pasteImage(png)))

    const text = await files.clipboard.readText()
    return Effect.runPromise(
      check(
        PasteResultSchema,
        text.trim() === "" ? { kind: "none" } : { kind: "text", text }
      )
    )
  })
  host.handle(CHANNELS.setRoomFolder, async (senderOk, args) => {
    if (!senderOk || args.length !== 1) throw refuse()
    let request: { code: string; folder: string | null }
    try {
      request = await Effect.runPromise(check(RoomFolderSchema, args[0]))
    } catch {
      // Schema errors can echo the code and the path, which must stay in main.
      throw refuse()
    }

    if (request.folder !== null) {
      try {
        checkFolder(request.folder)
      } catch {
        throw new Error(
          "Choose a real folder, not a shortcut or a missing one."
        )
      }
    }

    // The room may not be in the recent list yet, so lend it the open room's name.
    const name =
      currentRoom?.code === request.code && currentRoom.name
        ? currentRoom.name
        : request.code
    files.setRoomFolder(request.code, request.folder, name)
  })
  host.handle(CHANNELS.addFiles, async (senderOk, args) => {
    if (!senderOk || args.length !== 0) throw refuse()
    const paths = await files.pickFiles()
    return paths === null ? null : add(paths)
  })
  host.handle(CHANNELS.addDroppedFiles, async (senderOk, args) => {
    if (!senderOk || args.length !== 1) throw refuse()
    return add(args[0])
  })
  host.handle(CHANNELS.getCurrentRoom, async (senderOk, args) => {
    if (!senderOk || args.length !== 0) throw refuse()
    return currentRoom
  })
  host.handle(CHANNELS.setCurrentRoom, async (senderOk, args) => {
    if (!senderOk || args.length !== 1) throw refuse()
    try {
      currentRoom = await Effect.runPromise(check(CurrentRoomSchema, args[0]))
    } catch {
      // Schema errors can echo the code, which must stay in main.
      throw refuse()
    }
  })
  host.handle(CHANNELS.openRoomFolder, async (senderOk, args) => {
    if (!senderOk || args.length !== 1) throw refuse()
    const error = await files.openPath(roomFolder(files.roomsDir, args[0]))
    if (error) throw new Error("Could not open the room folder.")
  })
}

/** Calls a main-only endpoint with both secrets and bounded, local error prose. */
export async function callMainApi(
  info: ConnectionInfo,
  mainToken: string,
  route:
    | "/api/room/files"
    | "/api/downloads"
    | "/api/transfers"
    | "/api/transfers/save"
    | "/api/downloads/preview"
    | "/api/transfers/limits",
  body: unknown
): Promise<unknown> {
  const put = route === "/api/downloads" || route === "/api/transfers/limits"
  const generic = "Tailshare could not complete that file request."
  let response: Response
  try {
    response = await fetch(info.baseUrl + route, {
      method: put ? "PUT" : "POST",
      headers: {
        Authorization: `Bearer ${info.token}`,
        "X-Tailshare-Main": mainToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
  } catch {
    throw new Error(generic)
  }

  if (!response.ok) throw new Error(await sidecarMessage(response, generic))
  try {
    return await response.json()
  } catch {
    throw new Error(generic)
  }
}

/** Longest sidecar sentence shown on screen. */
const MAX_MESSAGE = 200

/** The sidecar's own plain sentence from an error body, or `fallback`. */
async function sidecarMessage(response: Response, fallback: string) {
  try {
    const { message } = (await response.json()) as { message?: unknown }
    if (typeof message === "string" && message.trim() !== "")
      return message.slice(0, MAX_MESSAGE)
  } catch {
    // An unreadable body keeps the generic sentence.
  }

  return fallback
}
