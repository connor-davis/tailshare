import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CHANNELS } from "../shared/ipc-schema"
import type { IpcHost } from "./ipc"
import { registerNotifyIpc, toastText } from "./notify"
import { createSavedDownloads, registerSavedIpc } from "./saved-downloads"
import { registerRoomIpc, type RoomFilesHost } from "./room-ipc"

type Handler = (senderOk: boolean, args: unknown[]) => Promise<unknown>

const dirs: string[] = []
const temp = () => {
  const path = mkdtempSync(join(tmpdir(), "tailshare-c-"))
  dirs.push(path)
  return path
}
afterEach(() => {
  for (const path of dirs.splice(0))
    rmSync(path, { recursive: true, force: true })
})

function host() {
  const handlers = new Map<string, Handler>()
  const ipc: IpcHost = {
    handle: (channel, handler) => handlers.set(channel, handler),
    pickFolder: async () => null,
  }
  return {
    ipc,
    call: (channel: string, sender: boolean, args: unknown[]) =>
      handlers.get(channel)!(sender, args),
  }
}

const ID = "A".repeat(26)

describe("notifications", () => {
  const setup = (over: { enabled?: boolean; active?: boolean } = {}) => {
    const show = vi.fn()
    const { ipc, call } = host()
    registerNotifyIpc(ipc, {
      enabled: () => over.enabled ?? true,
      windowActive: () => over.active ?? false,
      show,
    })
    return { show, call }
  }

  it("refuses a stranger, extra arguments and bad requests", async () => {
    const { call, show } = setup()
    const good = { kind: "done", name: "a.txt" }

    await expect(call(CHANNELS.notify, false, [good])).rejects.toThrow()
    await expect(call(CHANNELS.notify, true, [good, 1])).rejects.toThrow()
    await expect(
      call(CHANNELS.notify, true, [{ kind: "boom", name: "a" }])
    ).rejects.toThrow()
    await expect(
      call(CHANNELS.notify, true, [{ kind: "done", name: "" }])
    ).rejects.toThrow()
    expect(show).not.toHaveBeenCalled()
  })

  it("shows a toast only when on and the window is in the background", async () => {
    const good = [{ kind: "done", name: "a.txt" }]

    const off = setup({ enabled: false })
    await off.call(CHANNELS.notify, true, good)
    const active = setup({ active: true })
    await active.call(CHANNELS.notify, true, good)
    const on = setup()
    await on.call(CHANNELS.notify, true, good)

    expect(off.show).not.toHaveBeenCalled()
    expect(active.show).not.toHaveBeenCalled()
    expect(on.show).toHaveBeenCalledWith({
      title: "Transfer finished",
      body: "a.txt is done.",
    })
  })

  it("builds the words itself: base name, no control characters, clamped", () => {
    expect(toastText("failed", "C:\\Users\\me\\secret\\a.txt").body).toBe(
      "a.txt did not finish."
    )
    expect(toastText("join", "Pa\u0007t\u001b").body).toBe(
      "Pat is asking to join your room."
    )
    expect(toastText("join", "x".repeat(500)).body).toContain("x".repeat(64))
    expect(toastText("join", "x".repeat(500)).body).not.toContain(
      "x".repeat(65)
    )
    expect(toastText("join", "\u0007").body).toContain("Someone")
  })
})

describe("saved downloads: drag out and preview", () => {
  const setup = () => {
    const folder = temp()
    writeFileSync(join(folder, "a.txt"), "hello")
    const saved = createSavedDownloads()
    const startDrag = vi.fn()
    const reveal = vi.fn()
    const preview = vi.fn(async () => ({ kind: "text", text: "hello" }))
    const { ipc, call } = host()
    registerSavedIpc(ipc, saved, { startDrag, reveal, preview })
    return { folder, saved, startDrag, reveal, preview, call }
  }

  it("refuses a stranger, extra arguments and bad ids", async () => {
    const { call, startDrag } = setup()

    for (const channel of [
      CHANNELS.canDragFile,
      CHANNELS.startFileDrag,
      CHANNELS.revealDownload,
      CHANNELS.previewDownload,
    ]) {
      await expect(call(channel, false, [ID])).rejects.toThrow()
      await expect(call(channel, true, [ID, ID])).rejects.toThrow()
      await expect(call(channel, true, ["../x"])).rejects.toThrow()
    }
    expect(startDrag).not.toHaveBeenCalled()
  })

  it("ignores ids main does not know", async () => {
    const { call, startDrag, preview } = setup()

    expect(await call(CHANNELS.canDragFile, true, [ID])).toBe(false)
    await call(CHANNELS.startFileDrag, true, [ID])
    expect(await call(CHANNELS.previewDownload, true, [ID])).toEqual({
      kind: "none",
    })
    expect(startDrag).not.toHaveBeenCalled()
    expect(preview).not.toHaveBeenCalled()
  })

  it("drags a remembered file out once, with the path main built", async () => {
    const { call, saved, folder, startDrag } = setup()
    saved.remember({ id: ID, destination: "a.txt" }, folder)

    expect(await call(CHANNELS.canDragFile, true, [ID])).toBe(true)
    await call(CHANNELS.startFileDrag, true, [ID])

    expect(startDrag).toHaveBeenCalledTimes(1)
    expect(startDrag).toHaveBeenCalledWith(join(folder, "a.txt"))
  })

  it("reveals only a remembered file, with the path main built", async () => {
    const { call, saved, folder, reveal } = setup()

    await call(CHANNELS.revealDownload, true, [ID])
    expect(reveal).not.toHaveBeenCalled()

    saved.remember({ id: ID, destination: "a.txt" }, folder)
    await call(CHANNELS.revealDownload, true, [ID])
    expect(reveal).toHaveBeenCalledWith(join(folder, "a.txt"))
  })

  it("refuses names that point outside the folder", () => {
    const { saved, folder } = setup()

    for (const destination of ["../a.txt", "sub/a.txt", "C:a.txt", "..", "."])
      saved.remember({ id: ID, destination }, folder)

    expect(saved.locate(ID)).toBeNull()
  })

  it("refuses a file that is gone or is a folder", () => {
    const { saved, folder } = setup()
    mkdirSync(join(folder, "dir"))

    saved.remember({ id: ID, destination: "dir" }, folder)
    expect(saved.locate(ID)).toBeNull()

    saved.remember({ id: ID, destination: "missing.txt" }, folder)
    expect(saved.locate(ID)).toBeNull()
  })

  it("refuses a link, even one that points at a real file", () => {
    const { saved, folder } = setup()
    const target = join(temp(), "secret.txt")
    writeFileSync(target, "secret")
    try {
      symlinkSync(target, join(folder, "link.txt"))
    } catch {
      return // this machine cannot make links
    }

    saved.remember({ id: ID, destination: "link.txt" }, folder)

    expect(saved.locate(ID)).toBeNull()
  })

  it("forgets the oldest download after 200", () => {
    const { saved, folder } = setup()
    // Two letters give 676 distinct valid ids.
    const id = (n: number) =>
      "C".repeat(24) +
      String.fromCharCode(65 + Math.floor(n / 26)) +
      String.fromCharCode(65 + (n % 26))
    saved.remember({ id: id(0), destination: "a.txt" }, folder)
    expect(saved.locate(id(0))).not.toBeNull()

    for (let n = 1; n <= 200; n += 1)
      saved.remember({ id: id(n), destination: "a.txt" }, folder)

    expect(saved.locate(id(0))).toBeNull()
    expect(saved.locate(id(1))).not.toBeNull()
  })

  it("passes a good preview through and drops a bad one", async () => {
    const { call, saved, folder, preview } = setup()
    saved.remember({ id: ID, destination: "a.txt" }, folder)

    expect(await call(CHANNELS.previewDownload, true, [ID])).toEqual({
      kind: "text",
      text: "hello",
    })
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({ folder, name: "a.txt" })
    )

    preview.mockResolvedValueOnce({
      kind: "image",
      mime: "image/svg+xml",
      data: "AAAA",
    } as never)
    expect(await call(CHANNELS.previewDownload, true, [ID])).toEqual({
      kind: "none",
    })

    preview.mockRejectedValueOnce(new Error("C:\\secret"))
    expect(await call(CHANNELS.previewDownload, true, [ID])).toEqual({
      kind: "none",
    })
  })
})

describe("paste and the room folder", () => {
  const setup = (over: Partial<RoomFilesHost> = {}) => {
    const pasteDir = temp()
    const seen: string[] = []
    const files: RoomFilesHost = {
      roomsDir: "C:/rooms",
      pickFiles: async () => null,
      addFiles: async (paths) => {
        for (const path of paths) seen.push(path)
        return { added: [{ name: "Pasted", size: 1 }], skipped: [] }
      },
      openPath: async () => "",
      pickSaveFile: async () => null,
      saveMode: () => "folder",
      saveToFolder: async () => ({ id: "plain" }),
      saveInto: async () => ({ id: "room" }),
      saveFolder: () => "D:\\Save",
      roomSaveFolder: () => undefined,
      setRoomFolder: () => {},
      remember: () => {},
      clipboard: { readPng: async () => null, readText: async () => "" },
      pasteDir,
      ...over,
    }
    const { ipc, call } = host()
    registerRoomIpc(ipc, files)
    return { call, pasteDir, seen }
  }

  it("keeps a picker import bound to the room selected when it opened", async () => {
    let picked: (paths: string[]) => void = () => {}
    const addFiles = vi.fn(async () => ({ added: [], skipped: [] }))
    const { call } = setup({
      pickFiles: () =>
        new Promise<string[]>((resolve) => {
          picked = resolve
        }),
      addFiles,
    })
    await call(CHANNELS.setCurrentRoom, true, [
      { name: "First", code: "7K3Q9PXM" },
    ])
    const pending = call(CHANNELS.addFiles, true, [])
    await call(CHANNELS.setCurrentRoom, true, [
      { name: "Second", code: "8K3Q9PXM" },
    ])
    picked(["C:\\a.txt"])
    await pending
    expect(addFiles).toHaveBeenCalledWith(["C:\\a.txt"], "7K3Q9PXM")
  })

  it("refuses paste from a stranger or with arguments", async () => {
    const { call } = setup()

    await expect(call(CHANNELS.pasteClipboard, false, [])).rejects.toThrow()
    await expect(call(CHANNELS.pasteClipboard, true, [1])).rejects.toThrow()
  })

  it("says none for an empty clipboard", async () => {
    const { call } = setup()

    expect(await call(CHANNELS.pasteClipboard, true, [])).toEqual({
      kind: "none",
    })
  })

  it("hands text back, and a picture wins over text", async () => {
    const text = setup({
      clipboard: { readPng: async () => null, readText: async () => "hi" },
    })
    expect(await text.call(CHANNELS.pasteClipboard, true, [])).toEqual({
      kind: "text",
      text: "hi",
    })

    const both = setup({
      clipboard: {
        readPng: async () => Buffer.from("png"),
        readText: async () => "hi",
      },
    })
    const result = (await both.call(CHANNELS.pasteClipboard, true, [])) as {
      kind: string
    }
    expect(result.kind).toBe("file")
  })

  it("deletes the temporary picture after handing it over", async () => {
    const { call, seen, pasteDir } = setup({
      clipboard: {
        readPng: async () => Buffer.from("png"),
        readText: async () => "",
      },
    })

    await call(CHANNELS.pasteClipboard, true, [])

    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain(pasteDir)
    expect(seen[0]).toMatch(/Pasted picture .*\.png$/)
    expect(existsSync(seen[0]!)).toBe(false)
  })

  it("deletes the temporary picture when the hand-over fails", async () => {
    const paths: string[] = []
    const { call } = setup({
      addFiles: async (batch) => {
        paths.push(...batch)
        throw new Error("no")
      },
      clipboard: {
        readPng: async () => Buffer.from("png"),
        readText: async () => "",
      },
    })

    await expect(call(CHANNELS.pasteClipboard, true, [])).rejects.toThrow()

    expect(paths).toHaveLength(1)
    expect(existsSync(paths[0]!)).toBe(false)
  })

  it("refuses a picture over 25 MB and leaves no file", async () => {
    const { call, seen, pasteDir } = setup({
      clipboard: {
        readPng: async () => Buffer.alloc(25 * 1024 * 1024 + 1),
        readText: async () => "",
      },
    })

    await expect(call(CHANNELS.pasteClipboard, true, [])).rejects.toThrow()

    expect(seen).toHaveLength(0)
    expect(existsSync(join(pasteDir, "x"))).toBe(false)
  })

  it("sets and clears a room folder, and refuses bad ones", async () => {
    const folder = temp()
    const setRoomFolder = vi.fn()
    const { call } = setup({ setRoomFolder })
    const code = "7K3Q9PXM"

    await call(CHANNELS.setCurrentRoom, true, [{ name: "Movies", code }])
    await call(CHANNELS.setRoomFolder, true, [{ code, folder }])
    expect(setRoomFolder).toHaveBeenLastCalledWith(code, folder, "Movies")

    await call(CHANNELS.setRoomFolder, true, [{ code, folder: null }])
    expect(setRoomFolder).toHaveBeenLastCalledWith(code, null, "Movies")

    setRoomFolder.mockClear()
    await expect(
      call(CHANNELS.setRoomFolder, false, [{ code, folder }])
    ).rejects.toThrow()
    await expect(
      call(CHANNELS.setRoomFolder, true, [{ code, folder: "relative" }])
    ).rejects.toThrow()
    await expect(
      call(CHANNELS.setRoomFolder, true, [
        { code, folder: `${folder}${sep}..` },
      ])
    ).rejects.toThrow()
    await expect(
      call(CHANNELS.setRoomFolder, true, [
        { code, folder: join(folder, "nope") },
      ])
    ).rejects.toThrow("real folder")
    expect(setRoomFolder).not.toHaveBeenCalled()
  })

  it("uses the room folder before Save to my folder", async () => {
    const room = temp()
    const saveInto = vi.fn(async () => ({ id: "room" }))
    const saveToFolder = vi.fn()
    const remember = vi.fn()
    const { call } = setup({
      roomSaveFolder: () => room,
      saveInto,
      saveToFolder,
      remember,
    })
    await call(CHANNELS.setCurrentRoom, true, [
      { name: "Movies", code: "7K3Q9PXM" },
    ])

    await call(CHANNELS.startDownload, true, [
      { source: "docs/a.txt", name: "a.txt" },
    ])

    expect(saveToFolder).not.toHaveBeenCalled()
    expect(saveInto).toHaveBeenCalledWith({
      source: "docs/a.txt",
      name: "a.txt",
      folder: room,
    })
    expect(remember).toHaveBeenCalledWith({ id: "room" }, room)
  })

  it("opens Ask every time in the room folder", async () => {
    const room = temp()
    const pickSaveFile = vi.fn(async () => null)
    const { call } = setup({
      saveMode: () => "ask",
      roomSaveFolder: () => room,
      pickSaveFile,
    })
    await call(CHANNELS.setCurrentRoom, true, [
      { name: "Movies", code: "7K3Q9PXM" },
    ])

    await call(CHANNELS.startDownload, true, [
      { source: "docs/a.txt", name: "a.txt" },
    ])

    expect(pickSaveFile).toHaveBeenCalledWith(join(room, "a.txt"))
  })

  it("fails only that download when the room folder is gone", async () => {
    const saveInto = vi.fn()
    const { call } = setup({
      roomSaveFolder: () => join(tmpdir(), "tailshare-c-missing-folder"),
      saveInto,
    })
    await call(CHANNELS.setCurrentRoom, true, [
      { name: "Movies", code: "7K3Q9PXM" },
    ])

    await expect(
      call(CHANNELS.startDownload, true, [
        { source: "docs/a.txt", name: "a.txt" },
      ])
    ).rejects.toThrow("save folder")
    expect(saveInto).not.toHaveBeenCalled()
  })
})
