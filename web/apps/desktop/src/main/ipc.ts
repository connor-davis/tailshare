import { Effect, Schema } from "effect"
import {
  CHANNELS,
  ChosenFolderSchema,
  ConnectionInfoSchema,
  NoArgs,
  SettingsSchema,
  WindowStateSchema,
} from "../shared/ipc-schema"
import type { WindowState } from "../shared/bridge"
import type { SettingsStore } from "./settings"
import type { UpdateController } from "./updater"
import { Sidecar } from "./sidecar"

/** What the handlers need from Electron, so tests need no Electron. */
export interface IpcHost {
  /** Registers a handler. `senderOk` says the call came from our window. */
  handle(
    channel: string,
    handler: (senderOk: boolean, args: unknown[]) => Promise<unknown>
  ): void
  /** Native folder dialog. Resolves to the picked path or `null`. */
  pickFolder(): Promise<string | null>
}

// A plain sentence for the page. Detail stays in main.
const refuse = (what: string) => new Error(`Tailshare could not ${what}.`)

/** Checks a value with its schema. Fails with a SchemaError if it is wrong. */
export const check = <S extends Schema.Constraint>(schema: S, value: unknown) =>
  Schema.decodeUnknownEffect(schema as never)(value) as Effect.Effect<
    S["Type"],
    Schema.SchemaError
  >

// The shared front door: right sender, no extra arguments.
const guard = (senderOk: boolean, args: unknown[]) =>
  Effect.gen(function* () {
    if (!senderOk) return yield* Effect.fail(refuse("answer this window"))
    yield* check(NoArgs, args).pipe(
      Effect.mapError(() => refuse("read that request"))
    )
  })

/** Registers settings and updater requests behind the same window and tuple guards. */
export function registerUpdateIpc(
  host: IpcHost,
  settings: SettingsStore,
  updater: UpdateController
) {
  const actions: Record<string, () => unknown | Promise<unknown>> = {
    [CHANNELS.getSettings]: () => settings.get(),
    [CHANNELS.getUpdateStatus]: () => updater.status(),
    [CHANNELS.restartToUpdate]: () => updater.restart(),
  }

  for (const [channel, action] of Object.entries(actions)) {
    host.handle(channel, async (senderOk, args) => {
      await Effect.runPromise(guard(senderOk, args))
      const result = await action()
      return channel === CHANNELS.getSettings
        ? Effect.runPromise(check(SettingsSchema, result))
        : result
    })
  }

  // The store checks the whole patch before it writes or tells anyone.
  host.handle(CHANNELS.updateSettings, async (senderOk, args) => {
    if (!senderOk) throw refuse("answer this window")
    if (args.length !== 1) throw refuse("read that request")

    const result = settings.update(args[0])
    return Effect.runPromise(check(SettingsSchema, result))
  })
}

/** What the title bar can ask the window to do. */
export interface WindowControls {
  minimize(): void
  toggleMaximize(): void
  /** Goes through the window's close event, so close to tray still applies. */
  close(): void
  state(): WindowState
}

/** Registers the title bar requests behind the same window and tuple guards. */
export function registerWindowIpc(host: IpcHost, controls: WindowControls) {
  const actions: Record<string, () => unknown> = {
    [CHANNELS.windowMinimize]: () => controls.minimize(),
    [CHANNELS.windowToggleMaximize]: () => controls.toggleMaximize(),
    [CHANNELS.windowClose]: () => controls.close(),
    [CHANNELS.getWindowState]: () => controls.state(),
  }

  for (const [channel, action] of Object.entries(actions)) {
    host.handle(channel, async (senderOk, args) => {
      await Effect.runPromise(guard(senderOk, args))
      const result = action()
      return channel === CHANNELS.getWindowState
        ? Effect.runPromise(check(WindowStateSchema, result))
        : undefined
    })
  }
}

/**
 * Registers the two request channels. Each one refuses a sender that is not
 * our window and any extra arguments, then replies with a validated value.
 */
export const registerIpc = (host: IpcHost) =>
  Effect.gen(function* () {
    const sidecar = yield* Sidecar

    host.handle(CHANNELS.connectionInfo, (senderOk, args) =>
      Effect.runPromise(
        Effect.gen(function* () {
          yield* guard(senderOk, args)

          const info = yield* sidecar.connectionInfo.pipe(
            Effect.mapError((error) => new Error(error.message))
          )
          return yield* check(ConnectionInfoSchema, info).pipe(
            Effect.mapError(() => refuse("read the sidecar address"))
          )
        })
      )
    )

    host.handle(CHANNELS.chooseFolder, (senderOk, args) =>
      Effect.runPromise(
        Effect.gen(function* () {
          yield* guard(senderOk, args)

          const picked = yield* Effect.promise(() => host.pickFolder())
          return yield* check(ChosenFolderSchema, picked).pipe(
            Effect.mapError(() => refuse("read the chosen folder"))
          )
        })
      )
    )
  })
