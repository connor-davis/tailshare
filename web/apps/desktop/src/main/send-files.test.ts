import { afterEach, expect, it, vi } from "vitest"
import { createSendBatch, findSendPaths, sendToOpenRoom } from "./send-files"
import { applyExplorerMenu, explorerKeys } from "./explorer-menu"

afterEach(() => vi.useRealTimers())

it("parses explicit existing absolute paths on first and later launches", () => {
  const exists = vi.fn((path: string) => path !== "C:\\missing")
  expect(
    findSendPaths(
      [
        "Tailshare.exe",
        "--send",
        "C:\\My files\\one.txt",
        "--send",
        "\\\\server\\share\\folder",
      ],
      exists
    )
  ).toEqual(["C:\\My files\\one.txt", "\\\\server\\share\\folder"])
  expect(
    findSendPaths(
      [
        "--profile=other",
        "tailshare://join/7K3Q9PXM",
        "C:\\implicit",
        "--send",
        "relative",
        "--send",
        "C:\\missing",
        "--send",
      ],
      exists
    )
  ).toEqual([])
  expect(findSendPaths(["--send", "C:\\bad\0path"], exists)).toEqual([])
  expect(
    findSendPaths(["--send", "C:\\denied"], () => {
      throw new Error("private path")
    })
  ).toEqual([])
})

it("batches first-launch and second-instance selections after 500 quiet ms", async () => {
  vi.useFakeTimers()

  const send = vi.fn(async () => {})

  const batch = createSendBatch(send)
  batch.push(["C:\\one.txt"])
  await vi.advanceTimersByTimeAsync(300)
  batch.push(["C:\\two.txt", "C:\\folder"])
  await vi.advanceTimersByTimeAsync(499)
  expect(send).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(send).toHaveBeenCalledWith([
    "C:\\one.txt",
    "C:\\two.txt",
    "C:\\folder",
  ])
  batch.push(["C:\\next.txt"])
  await vi.advanceTimersByTimeAsync(500)
  expect(send).toHaveBeenLastCalledWith(["C:\\next.txt"])
})

it("serializes batches and recovers after a failed add without logging paths", async () => {
  vi.useFakeTimers()

  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error("C:\\private"))
    .mockResolvedValue(undefined)

  const batch = createSendBatch(send)
  batch.push(["C:\\one"])
  await vi.advanceTimersByTimeAsync(500)
  batch.push(["C:\\two"])
  await vi.advanceTimersByTimeAsync(500)
  expect(send).toHaveBeenCalledTimes(2)
})

it("writes only the two app-owned HKCU keys with a quoted executable and argument", async () => {
  const run = vi.fn(async () => {})
  await applyExplorerMenu(true, {
    packaged: true,
    execPath: "C:\\Program Files\\Tailshare\\Tailshare.exe",
    run,
  })

  expect(run).toHaveBeenCalledTimes(4)
  for (const key of explorerKeys) {
    expect(run).toHaveBeenCalledWith([
      "add",
      key,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      "Send with Tailshare",
      "/f",
    ])
    expect(run).toHaveBeenCalledWith([
      "add",
      `${key}\\command`,
      "/ve",
      "/t",
      "REG_SZ",
      "/d",
      '"C:\\Program Files\\Tailshare\\Tailshare.exe" --send "%1"',
      "/f",
    ])
  }

  run.mockClear()
  await applyExplorerMenu(false, { packaged: true, execPath: "unused", run })
  expect(run.mock.calls).toEqual(
    explorerKeys.map((key) => [["delete", key, "/f"]])
  )
})

it("does no registry work in development and tolerates absent keys on removal", async () => {
  const run = vi.fn(async () => {
    throw new Error("missing")
  })

  await applyExplorerMenu(true, { packaged: false, execPath: "unused", run })
  expect(run).not.toHaveBeenCalled()
  await expect(
    applyExplorerMenu(false, { packaged: true, execPath: "unused", run })
  ).resolves.toBeUndefined()
  expect(run).toHaveBeenCalledTimes(2)
})

it("does no registry work off Windows", async () => {
  const run = vi.fn(async () => {})
  for (const platform of ["linux", "darwin"] as const) {
    await applyExplorerMenu(true, {
      packaged: true,
      platform,
      execPath: "unused",
      run,
    })
  }

  expect(run).not.toHaveBeenCalled()
})

it("shows the no-room toast and never queues paths for later", async () => {
  const host = {
    currentRoom: () => null,
    connected: vi.fn(async () => true),
    add: vi.fn(async () => ({ added: [], skipped: [] })),
    post: vi.fn(async () => {}),
    showWindow: vi.fn(),
    noRoom: vi.fn(),
  }

  await sendToOpenRoom(["C:\\private.txt"], host)
  expect(host.showWindow).toHaveBeenCalledOnce()
  expect(host.noRoom).toHaveBeenCalledOnce()
  expect(host.connected).not.toHaveBeenCalled()
  expect(host.add).not.toHaveBeenCalled()
})

it("imports the current room's batch and posts only the copied base names", async () => {
  const host = {
    currentRoom: () => ({ code: "7K3Q9PXM", name: "Room" }),
    connected: async () => true,
    add: vi.fn(async () => ({
      added: [{ name: "Tree", size: 2, folder: true, count: 1 }],
      skipped: [],
    })),
    post: vi.fn(async () => {}),
    showWindow: vi.fn(),
    noRoom: vi.fn(),
  }

  await sendToOpenRoom(["C:\\Tree"], host)
  expect(host.add).toHaveBeenCalledWith(["C:\\Tree"])
  expect(host.post).toHaveBeenCalledWith("Tree", "7K3Q9PXM")
  expect(host.noRoom).not.toHaveBeenCalled()
})

it("drops a stale room batch before copying", async () => {
  const host = {
    currentRoom: vi
      .fn()
      .mockReturnValueOnce({ code: "7K3Q9PXM", name: "Room" })
      .mockReturnValue(null),
    connected: async () => true,
    add: vi.fn(async () => ({ added: [], skipped: [] })),
    post: vi.fn(async () => {}),
    showWindow: vi.fn(),
    noRoom: vi.fn(),
  }

  await sendToOpenRoom(["C:\\Tree"], host)
  expect(host.add).not.toHaveBeenCalled()
  expect(host.noRoom).toHaveBeenCalledOnce()
})
