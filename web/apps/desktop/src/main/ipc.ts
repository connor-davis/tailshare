import { Effect, Schema } from "effect"
import {
  CHANNELS,
  ChosenFolderSchema,
  ConnectionInfoSchema,
  NoArgs,
} from "../shared/ipc-schema"
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
