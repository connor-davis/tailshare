import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Layer } from "effect"
import { describe, expect, it, vi } from "vitest"
import type { ConnectionInfo } from "../shared/bridge"
import {
  CHANNELS,
  ChosenFolderSchema,
  ConnectionInfoSchema,
  NoArgs,
  SidecarStatusSchema,
} from "../shared/ipc-schema"
import { check, registerIpc, registerUpdateIpc, type IpcHost } from "./ipc"
import { Sidecar } from "./sidecar"
import { openSettings, type SettingsStore } from "./settings"
import type { UpdateController } from "./updater"

const GOOD: ConnectionInfo = {
  baseUrl: "http://127.0.0.1:4000",
  token: "ab".repeat(32),
}

const valid = (schema: Parameters<typeof check>[0], value: unknown) =>
  Effect.runPromise(Effect.result(check(schema, value))).then(
    (result) => result._tag === "Success"
  )

describe("IPC schemas", () => {
  it("accepts a good connection reply", async () => {
    expect(await valid(ConnectionInfoSchema, GOOD)).toBe(true)
  })

  it.each([
    ["a non-loopback address", { ...GOOD, baseUrl: "http://10.0.0.1:4000" }],
    ["a path on the address", { ...GOOD, baseUrl: "http://127.0.0.1:4000/x" }],
    ["a short token", { ...GOOD, token: "abc" }],
    ["an upper-case token", { ...GOOD, token: "AB".repeat(32) }],
    ["a missing token", { baseUrl: GOOD.baseUrl }],
    ["null", null],
    ["a string", "http://127.0.0.1:4000"],
  ])("rejects a connection reply with %s", async (_name, value) => {
    expect(await valid(ConnectionInfoSchema, value)).toBe(false)
  })

  it("accepts a folder path or null", async () => {
    expect(await valid(ChosenFolderSchema, "C:\\Users\\me\\Share")).toBe(true)
    expect(await valid(ChosenFolderSchema, null)).toBe(true)
  })

  it.each([
    ["an empty path", ""],
    ["a number", 7],
    ["an object", { path: "x" }],
    ["an oversized path", "a".repeat(4097)],
    ["undefined", undefined],
  ])("rejects a folder reply that is %s", async (_name, value) => {
    expect(await valid(ChosenFolderSchema, value)).toBe(false)
  })

  it("accepts only known sidecar statuses", async () => {
    expect(await valid(SidecarStatusSchema, "ready")).toBe(true)
    expect(await valid(SidecarStatusSchema, "exploded")).toBe(false)
  })

  it("accepts no arguments and refuses extras", async () => {
    expect(await valid(NoArgs, [])).toBe(true)
    expect(await valid(NoArgs, ["--flag"])).toBe(false)
  })
})

describe("update IPC", () => {
  function setupUpdates() {
    const handlers = new Map<string, Handler>()
    const store = openSettings(mkdtempSync(join(tmpdir(), "tailshare-ipc-")), {
      downloads: "C:\\Downloads",
      computerName: "BOX",
    })
    const settings = {
      get: vi.fn(() => store.get()),
      update: vi.fn((patch: unknown) => store.update(patch)),
      onChange: store.onChange,
    } satisfies SettingsStore
    const updater: UpdateController = {
      status: vi.fn(() => ({ state: "ready" as const })),
      setChannel: vi.fn(),
      restart: vi.fn(async () => {}),
      stop: vi.fn(),
    }
    registerUpdateIpc(
      {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        },
        pickFolder: async () => null,
      },
      settings,
      updater
    )
    return {
      handler: (channel: string) => handlers.get(channel)!,
      settings,
      updater,
    }
  }

  it("reads preferences and update state and restarts through the controller", async () => {
    const { handler, updater } = setupUpdates()
    await expect(
      handler(CHANNELS.getSettings)(true, [])
    ).resolves.toMatchObject({
      updateChannel: "latest",
      transfersAtOnce: 2,
    })
    await expect(handler(CHANNELS.getUpdateStatus)(true, [])).resolves.toEqual({
      state: "ready",
    })
    await handler(CHANNELS.restartToUpdate)(true, [])
    expect(updater.restart).toHaveBeenCalledOnce()
  })

  it.each([
    CHANNELS.getSettings,
    CHANNELS.getUpdateStatus,
    CHANNELS.restartToUpdate,
    CHANNELS.updateSettings,
  ])("rejects other windows and malformed arguments on %s", async (channel) => {
    const { handler, settings, updater } = setupUpdates()
    await expect(
      handler(channel)(
        false,
        channel === CHANNELS.updateSettings ? [{ mica: false }] : []
      )
    ).rejects.toThrow("could not answer this window")
    await expect(
      handler(channel)(true, [{ mica: false }, "extra"])
    ).rejects.toThrow("could not read that request")
    expect(settings.update).not.toHaveBeenCalled()
    expect(updater.restart).not.toHaveBeenCalled()
  })

  it("saves a valid patch and replies with every setting", async () => {
    const { handler, settings } = setupUpdates()
    await expect(
      handler(CHANNELS.updateSettings)(true, [
        { updateChannel: "nightly", closeToTray: true },
      ])
    ).resolves.toMatchObject({ updateChannel: "nightly", closeToTray: true })
    expect(settings.update).toHaveBeenCalledOnce()
  })

  it("refuses a bad patch whole, with a plain sentence and no change", async () => {
    const { handler, settings } = setupUpdates()
    await expect(
      handler(CHANNELS.updateSettings)(true, [
        { closeToTray: true, transfersAtOnce: 9 },
      ])
    ).rejects.toThrow("not valid")
    expect(settings.get().closeToTray).toBe(false)
  })
})

type Handler = (senderOk: boolean, args: unknown[]) => Promise<unknown>

/** Registers the handlers against a fake host and returns them by channel. */
async function setup(options: {
  info?: Effect.Effect<ConnectionInfo, never>
  picked?: string | null
}) {
  const handlers = new Map<string, Handler>()
  const host: IpcHost = {
    handle: (channel, handler) => void handlers.set(channel, handler),
    pickFolder: async () => options.picked ?? null,
  }
  const service = Layer.succeed(
    Sidecar,
    Sidecar.of({
      connectionInfo: options.info ?? Effect.succeed(GOOD),
      status: () => "ready",
      onStatus: () => () => {},
    })
  )
  await Effect.runPromise(registerIpc(host).pipe(Effect.provide(service)))

  return (channel: string) => handlers.get(channel)!
}

describe("registerIpc", () => {
  it("registers exactly the two request channels", async () => {
    const handler = await setup({})

    expect(handler(CHANNELS.connectionInfo)).toBeTypeOf("function")
    expect(handler(CHANNELS.chooseFolder)).toBeTypeOf("function")
  })

  it("answers getConnectionInfo for our window", async () => {
    const handler = await setup({})

    await expect(handler(CHANNELS.connectionInfo)(true, [])).resolves.toEqual(
      GOOD
    )
  })

  it("refuses a sender that is not our window", async () => {
    const handler = await setup({})

    await expect(handler(CHANNELS.connectionInfo)(false, [])).rejects.toThrow(
      "could not answer this window"
    )
    await expect(handler(CHANNELS.chooseFolder)(false, [])).rejects.toThrow(
      "could not answer this window"
    )
  })

  it("refuses extra arguments", async () => {
    const handler = await setup({})

    await expect(handler(CHANNELS.connectionInfo)(true, ["x"])).rejects.toThrow(
      "could not read that request"
    )
    await expect(handler(CHANNELS.chooseFolder)(true, [{}])).rejects.toThrow(
      "could not read that request"
    )
  })

  it("never hands out a malformed address", async () => {
    const handler = await setup({
      info: Effect.succeed({ ...GOOD, baseUrl: "http://evil.test:80" }),
    })

    await expect(handler(CHANNELS.connectionInfo)(true, [])).rejects.toThrow(
      "could not read the sidecar address"
    )
  })

  it("returns the picked folder, or null when cancelled", async () => {
    const picked = await setup({ picked: "C:\\Share" })
    const cancelled = await setup({ picked: null })

    await expect(picked(CHANNELS.chooseFolder)(true, [])).resolves.toBe(
      "C:\\Share"
    )
    await expect(cancelled(CHANNELS.chooseFolder)(true, [])).resolves.toBeNull()
  })

  it("gives the page the failure sentence when the sidecar is down", async () => {
    const handlers = new Map<string, Handler>()
    const down = Layer.succeed(
      Sidecar,
      Sidecar.of({
        connectionInfo: Effect.fail({
          _tag: "SidecarError",
          message: "The sidecar could not be started. Restart Tailshare.",
        } as never),
        status: () => "failed",
        onStatus: () => () => {},
      })
    )
    await Effect.runPromise(
      registerIpc({
        handle: (channel, handler) => void handlers.set(channel, handler),
        pickFolder: async () => null,
      }).pipe(Effect.provide(down))
    )

    await expect(
      handlers.get(CHANNELS.connectionInfo)!(true, [])
    ).rejects.toThrow("The sidecar could not be started. Restart Tailshare.")
  })
})
