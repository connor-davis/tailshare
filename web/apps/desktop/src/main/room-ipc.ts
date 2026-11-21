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
  StartDownloadSchema,
} from "../shared/ipc-schema"
import { check, type IpcHost } from "./ipc"

/** Main-owned dependencies; no local path or main token is returned to the page. */
export interface RoomFilesHost {
  pickFiles(): Promise<string[] | null>
  addFiles(paths: readonly string[]): Promise<AddFilesResult>
  /** Native Save dialog for one file. Null when the person cancels. */
  pickSaveFile(name: string): Promise<string | null>
  /** The saved "where do downloads go" choice. */
  saveMode(): "folder" | "ask"
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
  host.handle(CHANNELS.startDownload, async (senderOk, args) => {
    if (!senderOk || args.length !== 1) throw refuse()
    let request: { source: string; name: string }
    try {
      request = await Effect.runPromise(check(StartDownloadSchema, args[0]))
    } catch {
      throw refuse()
    }

    // Only "ask every time" opens a dialog; the other mode saves to the folder.
    if (files.saveMode() !== "ask") return files.saveToFolder(request)
    const picked = await files.pickSaveFile(request.name)
    if (picked === null) return null

    return files.saveInto({
      source: request.source,
      folder: dirname(picked),
      name: basename(picked),
    })
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
