import { Effect, Schema } from "effect"
import {
  CHANNELS,
  ChosenFolderSchema,
  ConnectionInfoSchema,
  DownloadsStatusSchema,
  NoArgs,
  RecentRoomsSchema,
  SettingsSchema,
  WindowStateSchema,
} from "../shared/ipc-schema"
import {
  isForwardLink,
  isReleaseLink,
  type DownloadsStatus,
  type WindowState,
} from "../shared/bridge"
import type { RecentRoomsStore } from "./recent-rooms"
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
  updater: UpdateController,
  openExternal: (url: string) => Promise<void>
) {
  const actions: Record<string, () => unknown | Promise<unknown>> = {
    [CHANNELS.getSettings]: () => settings.get(),
    [CHANNELS.getUpdateStatus]: () => updater.status(),
    [CHANNELS.checkForUpdates]: () => updater.checkNow(),
    [CHANNELS.downloadUpdate]: () => updater.download(),
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

  host.handle(CHANNELS.openReleaseLink, async (senderOk, args) => {
    if (!senderOk) throw refuse("answer this window")
    if (args.length !== 1 || !isReleaseLink(args[0]))
      throw refuse("read that request")

    try {
      await openExternal(args[0])
    } catch {
      throw refuse("open this release link. Try again")
    }
  })

  host.handle(CHANNELS.openForwardLink, async (senderOk, args) => {
    if (!senderOk) throw refuse("answer this window")
    if (args.length !== 1 || !isForwardLink(args[0]))
      throw refuse("read that request")

    try {
      await openExternal(args[0])
    } catch {
      throw refuse("open this app. Try again")
    }
  })

  // The store checks the whole patch before it writes or tells anyone.
  host.handle(CHANNELS.updateSettings, async (senderOk, args) => {
    if (!senderOk) throw refuse("answer this window")
    if (args.length !== 1) throw refuse("read that request")

    // The page may only remove a trusted computer (revokeTrusted), never add one.
    if (args[0] && typeof args[0] === "object" && "trustedComputers" in args[0])
      throw refuse("read that request")

    const result = settings.update(args[0])
    return Effect.runPromise(check(SettingsSchema, result))
  })
}

/**
 * Registers the recent rooms requests behind the same window guard. The store
 * checks every room and code, and the list is checked again on the way out.
 */
export function registerRecentRoomsIpc(
  host: IpcHost,
  recent: RecentRoomsStore
) {
  const reply = (rooms: unknown) =>
    Effect.runPromise(check(RecentRoomsSchema, rooms))

  host.handle(CHANNELS.getRecentRooms, async (senderOk, args) => {
    await Effect.runPromise(guard(senderOk, args))
    return reply(recent.get())
  })

  // Touch and remove take exactly one value, which the store validates.
  for (const [channel, action] of [
    [CHANNELS.touchRecentRoom, (value: unknown) => recent.touch(value)],
    [CHANNELS.removeRecentRoom, (value: unknown) => recent.remove(value)],
  ] as const) {
    host.handle(channel, async (senderOk, args) => {
      if (!senderOk) throw refuse("answer this window")
      if (args.length !== 1) throw refuse("read that request")

      await reply(action(args[0]))
    })
  }
}

/** What the page can ask about its window. Windows draws the caption buttons. */
export interface WindowControls {
  state(): WindowState
}

/** Registers the window state request behind the same window and tuple guards. */
export function registerWindowIpc(host: IpcHost, controls: WindowControls) {
  host.handle(CHANNELS.getWindowState, async (senderOk, args) => {
    await Effect.runPromise(guard(senderOk, args))
    return Effect.runPromise(check(WindowStateSchema, controls.state()))
  })
}

/** Registers the downloads status request behind the same window and tuple guards. */
export function registerDownloadsIpc(
  host: IpcHost,
  status: () => DownloadsStatus
) {
  host.handle(CHANNELS.getDownloadsStatus, async (senderOk, args) => {
    await Effect.runPromise(guard(senderOk, args))
    return Effect.runPromise(check(DownloadsStatusSchema, status()))
  })
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
