import { join } from "node:path"
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
} from "../shared/ipc-schema"
import { check, type IpcHost } from "./ipc"

/** Main-owned dependencies; no local path or main token is returned to the page. */
export interface RoomFilesHost {
  pickFiles(): Promise<string[] | null>
  addFiles(paths: readonly string[]): Promise<AddFilesResult>
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
  const add = async (paths: unknown) => {
    try {
      const checked = await Effect.runPromise(check(AddedPathsSchema, paths))
      return await Effect.runPromise(
        check(AddFilesResultSchema, await files.addFiles(checked))
      )
    } catch {
      // Schema errors can include input paths, which must stay in main.
      throw new Error("Tailshare could not add those files.")
    }
  }
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
  route: "/api/room/files" | "/api/downloads",
  body: unknown
): Promise<unknown> {
  try {
    const response = await fetch(info.baseUrl + route, {
      method: route === "/api/downloads" ? "PUT" : "POST",
      headers: {
        Authorization: `Bearer ${info.token}`,
        "X-Tailshare-Main": mainToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error()
    return await response.json()
  } catch {
    throw new Error("Tailshare could not complete that file request.")
  }
}
