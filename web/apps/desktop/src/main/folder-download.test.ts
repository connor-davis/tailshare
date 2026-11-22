import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { CHANNELS } from "../shared/ipc-schema"
import { callMainApi, registerRoomIpc, type RoomFilesHost } from "./room-ipc"

const directories: string[] = []
afterEach(() => {
  for (const folder of directories.splice(0))
    rmSync(folder, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup(mode: "ask" | "folder", picked: boolean = true) {
  const parent = mkdtempSync(join(tmpdir(), "tailshare-folders-"))
  directories.push(parent)

  const room = join(parent, "room")
  mkdirSync(room)

  const handlers = new Map<
    string,
    (sender: boolean, args: unknown[]) => Promise<unknown>
  >()

  const pickFolder = vi.fn(async () => (picked ? parent : null))

  const saveFolderTree = vi.fn(async () => ({
    items: [{ id: "a", destination: "Tree/sub/a.txt" }],
  }))

  const remember = vi.fn()

  const addFiles = vi.fn(async () => ({
    added: [{ name: "Tree", size: 5, folder: true, count: 2 }],
    skipped: [],
  }))

  const files: RoomFilesHost = {
    roomsDir: parent,
    pasteDir: parent,
    pickFiles: async () => null,
    addFiles,
    pickFolder,
    pickSaveFile: async () => {
      throw new Error("not a file")
    },
    saveMode: () => mode,
    saveFolder: () => parent,
    roomSaveFolder: () => room,
    setRoomFolder: () => {},
    remember,
    clipboard: { readPng: async () => null, readText: async () => "" },
    saveToFolder: async () => {
      throw new Error("not a file")
    },
    saveInto: async () => {
      throw new Error("not a file")
    },
    saveFolderTree,
    openPath: async () => "",
  }

  registerRoomIpc(
    {
      handle: (channel, handler) => handlers.set(channel, handler),
      pickFolder,
    },
    files
  )

  return {
    parent,
    room,
    pickFolder,
    saveFolderTree,
    remember,
    addFiles,
    call: (channel: string, sender: boolean, args: unknown[]) =>
      handlers.get(channel)!(sender, args),
  }
}

it("uses the room folder and pins all folder-download results in main", async () => {
  const host = setup("folder")
  await host.call(CHANNELS.setCurrentRoom, true, [
    { code: "7K3Q9PXM", name: "Room" },
  ])
  await host.call(CHANNELS.startDownload, true, [
    { source: "Tree", name: "Tree", folder: true },
  ])
  expect(host.saveFolderTree).toHaveBeenCalledWith({
    peerPath: "Tree",
    folder: host.room,
  })

  expect(host.pickFolder).not.toHaveBeenCalled()
  expect(host.remember).toHaveBeenCalledWith(
    { id: "a", destination: "Tree/sub/a.txt" },
    host.room
  )
})

it("asks for a parent folder, handles cancel and refuses stranger requests", async () => {
  const host = setup("ask")
  await host.call(CHANNELS.startDownload, true, [
    { source: "Tree", name: "Tree", folder: true },
  ])
  expect(host.saveFolderTree).toHaveBeenCalledWith({
    peerPath: "Tree",
    folder: host.parent,
  })

  const cancelled = setup("ask", false)
  expect(
    await cancelled.call(CHANNELS.startDownload, true, [
      { source: "Tree", name: "Tree", folder: true },
    ])
  ).toBeNull()
  expect(cancelled.saveFolderTree).not.toHaveBeenCalled()
  await expect(
    host.call(CHANNELS.startDownload, false, [
      { source: "Tree", name: "Tree", folder: true },
    ])
  ).rejects.toThrow()
  await expect(host.call(CHANNELS.addFolder, false, [])).rejects.toThrow()
})

it("the folder picker uses the same import path and preserves counts", async () => {
  const host = setup("folder")
  expect(await host.call(CHANNELS.addFolder, true, [])).toEqual({
    added: [{ name: "Tree", size: 5, folder: true, count: 2 }],
    skipped: [],
  })

  expect(host.addFiles).toHaveBeenCalledWith([host.parent])
})

it("allows ten minutes for folder work and retains the single-file timeout", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout")
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}"))
  )

  const info = { baseUrl: "http://127.0.0.1:12345", token: "a".repeat(64) }
  await callMainApi(
    info,
    "b".repeat(64),
    "/api/room/files",
    { paths: [] },
    600_000
  )
  expect(timeout).toHaveBeenLastCalledWith(600_000)
  await callMainApi(info, "b".repeat(64), "/api/room/files", { paths: [] })
  expect(timeout).toHaveBeenLastCalledWith(120_000)
})
