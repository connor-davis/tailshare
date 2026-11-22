import { Effect, Schema } from "effect"
import type { Settings, TrustedComputer } from "../shared/bridge"
import { CHANNELS, NODE_KEY, TrustedComputerSchema } from "../shared/ipc-schema"
import { check, type IpcHost } from "./ipc"

/** The most computers that can be trusted. The sidecar enforces the same cap. */
export const MAX_TRUSTED = 100

/** What {@link createTrusted} needs from main. */
export interface TrustedDeps {
  /** The saved settings. `update` checks the patch, saves it and tells listeners. */
  settings: {
    get(): Pick<Settings, "trustedComputers">
    update(patch: { trustedComputers: TrustedComputer[] }): unknown
  }
  /** Sends the whole key list to the sidecar. */
  push(body: { keys: string[] }): Promise<unknown>
  /** Asks the sidecar who is behind this waiting join request. Fails for a stale id. */
  joinKey(id: number): Promise<unknown>
  /** Allows this waiting join request. */
  allow(id: number): Promise<unknown>
  /** The clock, in ms since 1970. Tests pass their own. */
  now?: () => number
}

/** The sidecar's answer about a waiting join request. */
const JoinKeySchema = Schema.Struct({
  key: Schema.String.check(Schema.isPattern(NODE_KEY)),
  displayName: Schema.String,
  fingerprint: Schema.optionalKey(Schema.String),
})

/**
 * Keeps the sidecar's in-memory trusted list the same as the saved one. Call
 * `apply` when the sidecar is ready and when the list changes. A failure is
 * dropped: the next start or change sends the list again.
 */
export function createTrusted(deps: TrustedDeps) {
  let queue: Promise<unknown> = Promise.resolve()
  const refuse = (what: string) => new Error(`Tailshare could not ${what}.`)

  const apply = (): Promise<void> => {
    const run = queue.then(() =>
      deps
        .push({ keys: deps.settings.get().trustedComputers.map((c) => c.key) })
        .then(
          () => undefined,
          () => undefined
        )
    )
    queue = run

    return run
  }

  return {
    /** Sends the saved list, one call at a time, newest last. */
    apply,

    /**
     * Saves the computer behind a waiting join request as trusted, sends the
     * list to the sidecar, and then allows it. The key comes from the sidecar for
     * that exact prompt, so a stale id fails and the page never names a key. If
     * the allow fails (it timed out), the computer stays trusted.
     */
    async trust(id: unknown): Promise<void> {
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)
        throw refuse("read that request")

      const found = await Effect.runPromise(
        check(JoinKeySchema, await deps.joinKey(id))
      ).catch((error: unknown) => {
        // A sidecar sentence is already fit for the screen; a schema error is not.
        if (error instanceof Error && !("_tag" in error)) throw error
        throw refuse("read that join request")
      })

      const entry = await Effect.runPromise(
        check(TrustedComputerSchema, {
          key: found.key,
          label: found.displayName.trim().slice(0, 64) || "Computer",
          addedAt: (deps.now ?? Date.now)(),
          ...(found.fingerprint && /^[0-9a-f]{12}$/.test(found.fingerprint)
            ? { fingerprint: found.fingerprint }
            : {}),
        })
      ).catch(() => {
        throw refuse("read that join request")
      })

      const saved = deps.settings.get().trustedComputers
      const known = saved.find((computer) => computer.key === entry.key)
      if (!known && saved.length >= MAX_TRUSTED)
        throw new Error(
          "You can trust up to 100 computers. Remove one in Settings first."
        )

      deps.settings.update({
        trustedComputers: [
          ...saved.filter((computer) => computer.key !== entry.key),
          // The first time stays; only the reminder name is refreshed.
          { ...entry, addedAt: known?.addedAt ?? entry.addedAt },
        ],
      })
      await apply()
      await deps.allow(id)
    },

    /** Forgets one computer by its exact key. Someone already inside stays. */
    revoke(key: unknown): void {
      if (typeof key !== "string" || !NODE_KEY.test(key))
        throw refuse("read that request")

      const saved = deps.settings.get().trustedComputers
      if (!saved.some((computer) => computer.key === key)) return

      deps.settings.update({
        trustedComputers: saved.filter((computer) => computer.key !== key),
      })
    },
  }
}

/** The trust controls, as {@link registerTrustedIpc} needs them. */
export type Trusted = ReturnType<typeof createTrusted>

/** Registers the two trust requests behind the window guard and a one-value tuple. */
export function registerTrustedIpc(host: IpcHost, trusted: Trusted) {
  for (const [channel, action] of [
    [CHANNELS.trustJoin, (value: unknown) => trusted.trust(value)],
    [CHANNELS.revokeTrusted, (value: unknown) => trusted.revoke(value)],
  ] as const) {
    host.handle(channel, async (senderOk, args) => {
      if (!senderOk) throw new Error("Tailshare could not answer this window.")
      if (args.length !== 1)
        throw new Error("Tailshare could not read that request.")

      await action(args[0])
    })
  }
}
