import { Context, Data, Effect, Layer, Schedule } from "effect"
import type { ConnectionInfo, SidecarStatus } from "../shared/bridge"
import { ReadyScanner } from "./ready-line"

/** The slice of a child process the supervisor uses. Tests fake it. */
export interface SidecarChild {
  /** Calls `listener` for each chunk of stdout text. */
  readonly onStdout: (listener: (chunk: string) => void) => void
  /** Calls `listener` once when the child ends, even if it already has. */
  readonly onExit: (listener: (reason: string) => void) => void
  /** Closes stdin, which tells the sidecar to stop on its own. */
  readonly closeStdin: () => void
  /** Ends the child at once. Only used after the polite stop timed out. */
  readonly kill: () => void
}

/** Everything the supervisor needs from outside, so tests can swap it. */
export interface SidecarDeps {
  /** Starts one child with this token. May throw if it cannot start. */
  readonly spawn: (token: string) => SidecarChild
  /** Makes a new token. */
  readonly newToken: () => string
  /** One health attempt. Rejects when the sidecar is not healthy. */
  readonly health: (baseUrl: string, token: string) => Promise<void>
}

/** Timings in milliseconds. Tests pass tiny ones. */
export interface SidecarTimings {
  /** Time for the ready line and the first good health check together. */
  readonly startupMs: number
  /** Pause between failed health attempts. */
  readonly healthRetryMs: number
  /** First restart delay. It doubles, with jitter, up to `maxBackoffMs`. */
  readonly backoffMs: number
  /** The longest restart delay. */
  readonly maxBackoffMs: number
  /** Restarts allowed in a row before we give up. */
  readonly maxRestarts: number
  /** A run this long counts as stable and resets the restart count. */
  readonly stableMs: number
  /** Time a child gets to exit after stdin closes, before it is killed. */
  readonly stopMs: number
  /** How long `connectionInfo` waits for a sidecar that is starting. */
  readonly waitMs: number
}

/** Production timings. */
export const DEFAULT_TIMINGS: SidecarTimings = {
  startupMs: 15_000,
  healthRetryMs: 200,
  backoffMs: 500,
  maxBackoffMs: 10_000,
  maxRestarts: 5,
  stableMs: 30_000,
  stopMs: 3_000,
  waitMs: 20_000,
}

/** Why a start or a run failed. The message is a plain sentence. */
export class SidecarError extends Data.TaggedError("SidecarError")<{
  readonly message: string
}> {}

/** What the rest of main sees of the sidecar. */
export class Sidecar extends Context.Service<
  Sidecar,
  {
    /** Resolves when ready; fails at once if the sidecar is down for good. */
    readonly connectionInfo: Effect.Effect<ConnectionInfo, SidecarError>
    /** The current state. */
    readonly status: () => SidecarStatus
    /** Subscribes to state changes. Returns an unsubscribe. */
    readonly onStatus: (listener: (status: SidecarStatus) => void) => () => void
  }
>()("tailshare/main/Sidecar") {}

/**
 * Starts the supervisor in the current scope. Closing the scope stops the
 * running child (stdin first, kill after `stopMs`) and any pending restart.
 */
export const makeSidecar = (deps: SidecarDeps, timings: SidecarTimings) =>
  Effect.gen(function* () {
    let status: SidecarStatus = "starting"
    let info: ConnectionInfo | null = null
    const listeners = new Set<(status: SidecarStatus) => void>()

    const setStatus = (next: SidecarStatus, value: ConnectionInfo | null) => {
      status = next
      info = value
      listeners.forEach((listener) => listener(next))
    }

    // One child, start to finish. Succeeds if it ran stably and then ended
    // (so the next start gets a fresh restart count); fails otherwise.
    const runOnce = Effect.scoped(
      Effect.gen(function* () {
        const token = deps.newToken()

        const child = yield* Effect.acquireRelease(
          Effect.try({
            try: () => deps.spawn(token),
            catch: (error) =>
              new SidecarError({
                message: `Could not start: ${String(error)}`,
              }),
          }),
          (started) => stopChild(started, timings.stopMs)
        )

        const baseUrl = yield* readyLine(child).pipe(
          Effect.tap((url) =>
            waitHealthy(deps, url, token, timings.healthRetryMs)
          ),
          Effect.timeoutOrElse({
            duration: timings.startupMs,
            orElse: () =>
              Effect.fail(
                new SidecarError({
                  message: "The sidecar did not start in time.",
                })
              ),
          })
        )

        const startedAt = Date.now()
        setStatus("ready", { baseUrl, token })

        const reason = yield* exited(child)
        if (Date.now() - startedAt >= timings.stableMs) return

        return yield* new SidecarError({ message: `The sidecar ${reason}.` })
      })
    )

    // Delay between restarts: doubling from backoffMs, capped, with jitter.
    const backoff = Schedule.min([
      Schedule.exponential(timings.backoffMs),
      Schedule.spaced(timings.maxBackoffMs),
    ]).pipe(Schedule.jittered)

    const supervise = Effect.gen(function* () {
      while (true) {
        const result = yield* Effect.result(
          runOnce.pipe(
            Effect.tapError(() =>
              Effect.sync(() => setStatus("restarting", null))
            ),
            Effect.retry({ schedule: backoff, times: timings.maxRestarts })
          )
        )
        if (result._tag === "Failure") {
          setStatus("failed", null)
          return
        }
        // A stable run ended: go round again with a fresh count.
        setStatus("restarting", null)
      }
    })

    yield* Effect.forkScoped(supervise)

    const connectionInfo = Effect.callback<ConnectionInfo, SidecarError>(
      (resume) => {
        const settle = (): boolean => {
          if (status === "ready" && info) {
            resume(Effect.succeed(info))
            return true
          }
          if (status === "failed") {
            resume(
              Effect.fail(
                new SidecarError({
                  message:
                    "The sidecar could not be started. Restart Tailshare.",
                })
              )
            )
            return true
          }
          return false
        }
        if (settle()) return

        const listener = () => {
          if (settle()) listeners.delete(listener)
        }
        listeners.add(listener)

        return Effect.sync(() => void listeners.delete(listener))
      }
    ).pipe(
      Effect.timeoutOrElse({
        duration: timings.waitMs,
        orElse: () =>
          Effect.fail(
            new SidecarError({ message: "The sidecar is not answering yet." })
          ),
      })
    )

    return Sidecar.of({
      connectionInfo,
      status: () => status,
      onStatus: (listener) => {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
    })
  })

/** The production layer: one supervisor that lives as long as the layer. */
export const sidecarLayer = (deps: SidecarDeps, timings = DEFAULT_TIMINGS) =>
  Layer.effect(Sidecar, makeSidecar(deps, timings))

// Resolves with the base URL from the ready line, or fails if the child ends
// first or speaks out of contract.
const readyLine = (child: SidecarChild) =>
  Effect.callback<string, SidecarError>((resume) => {
    const scanner = new ReadyScanner()

    child.onStdout((chunk) => {
      const result = scanner.push(chunk)
      if (result.kind === "ready") resume(Effect.succeed(result.baseUrl))
      if (result.kind === "bad") {
        resume(
          Effect.fail(
            new SidecarError({
              message: `The sidecar sent a ${result.reason}.`,
            })
          )
        )
      }
    })
    child.onExit((reason) =>
      resume(
        Effect.fail(
          new SidecarError({
            message: `The sidecar ${reason} before it was ready.`,
          })
        )
      )
    )
  })

const exited = (child: SidecarChild) =>
  Effect.callback<string>((resume) => {
    child.onExit((reason) => resume(Effect.succeed(reason)))
  })

// Health is retried until the startup deadline above cuts it off.
const waitHealthy = (
  deps: SidecarDeps,
  baseUrl: string,
  token: string,
  retryMs: number
) =>
  Effect.tryPromise({
    try: () => deps.health(baseUrl, token),
    catch: (error) =>
      new SidecarError({ message: `Health check failed: ${String(error)}` }),
  }).pipe(Effect.retry(Schedule.spaced(retryMs)))

// Polite stop first: closing stdin makes the sidecar exit by itself. Kill only
// if it has not gone after `stopMs`.
const stopChild = (child: SidecarChild, stopMs: number) =>
  Effect.sync(() => child.closeStdin()).pipe(
    Effect.andThen(exited(child)),
    Effect.timeout(stopMs),
    Effect.catch(() => Effect.sync(() => child.kill())),
    Effect.ignore
  )
