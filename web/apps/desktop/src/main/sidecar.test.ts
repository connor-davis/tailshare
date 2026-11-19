import { Effect, Exit, Scope } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type SidecarChild,
  type SidecarDeps,
  makeSidecar,
  type SidecarTimings,
} from "./sidecar"

const READY = "TAILSHARE_READY http://127.0.0.1:4000\n"
const TOKEN = "ab".repeat(32)

const FAST: SidecarTimings = {
  startupMs: 200,
  healthRetryMs: 5,
  backoffMs: 5,
  maxBackoffMs: 20,
  maxRestarts: 2,
  stableMs: 60_000,
  stopMs: 50,
  waitMs: 500,
}

/** A scripted child. Tests decide what it prints and when it ends. */
class FakeChild implements SidecarChild {
  stdinClosed = 0
  killed = 0
  // A polite child leaves when stdin closes. A stubborn one needs a kill.
  polite = true
  private exitReason: string | null = null
  private stdout: Array<(chunk: string) => void> = []
  private exits: Array<(reason: string) => void> = []

  onStdout = (listener: (chunk: string) => void) =>
    void this.stdout.push(listener)

  onExit = (listener: (reason: string) => void) => {
    if (this.exitReason !== null) listener(this.exitReason)
    else this.exits.push(listener)
  }

  closeStdin = () => {
    this.stdinClosed++
    if (this.polite) this.end("exited (0)")
  }

  kill = () => {
    this.killed++
    this.end("was killed")
  }

  print(chunk: string) {
    this.stdout.forEach((listener) => listener(chunk))
  }

  end(reason: string) {
    if (this.exitReason !== null) return
    this.exitReason = reason
    this.exits.forEach((listener) => listener(reason))
  }
}

/** Starts a supervisor with fakes. `script` shapes each spawned child. */
async function start(
  script: (child: FakeChild, index: number) => void,
  options: {
    timings?: Partial<SidecarTimings>
    health?: SidecarDeps["health"]
  } = {}
) {
  const children: FakeChild[] = []
  const deps: SidecarDeps = {
    spawn: () => {
      const child = new FakeChild()
      children.push(child)
      // Let the supervisor subscribe first, as a real process would.
      queueMicrotask(() => script(child, children.length - 1))
      return child
    },
    newToken: () => TOKEN,
    health: options.health ?? (() => Promise.resolve()),
  }

  const scope = Effect.runSync(Scope.make())
  const sidecar = await Effect.runPromise(
    makeSidecar(deps, { ...FAST, ...options.timings }).pipe(
      Effect.provideService(Scope.Scope, scope)
    )
  )

  return {
    sidecar,
    children,
    stop: () => Effect.runPromise(Scope.close(scope, Exit.succeed(undefined))),
  }
}

const until = (check: () => boolean) =>
  vi.waitFor(() => expect(check()).toBe(true), { timeout: 2000, interval: 5 })

const open: Array<() => Promise<void>> = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((stop) => stop()))
})

async function run(...args: Parameters<typeof start>) {
  const started = await start(...args)
  open.push(started.stop)
  return started
}

describe("sidecar startup", () => {
  it("becomes ready after the ready line and a good health check", async () => {
    const calls: string[] = []
    const { sidecar } = await run((child) => child.print(READY), {
      health: async (url, token) => void calls.push(`${url} ${token}`),
    })

    const info = await Effect.runPromise(sidecar.connectionInfo)

    expect(info).toEqual({ baseUrl: "http://127.0.0.1:4000", token: TOKEN })
    expect(sidecar.status()).toBe("ready")
    expect(calls).toEqual([`http://127.0.0.1:4000 ${TOKEN}`])
  })

  it("retries health until it passes", async () => {
    let attempts = 0
    const { sidecar } = await run((child) => child.print(READY), {
      health: async () => {
        if (++attempts < 3) throw new Error("not yet")
      },
    })

    await Effect.runPromise(sidecar.connectionInfo)

    expect(attempts).toBe(3)
  })

  it("does not report ready when health never passes", async () => {
    const { sidecar } = await run((child) => child.print(READY), {
      timings: { startupMs: 40, maxRestarts: 0 },
      health: () => Promise.reject(new Error("nope")),
    })

    await until(() => sidecar.status() === "failed")
    const error = await Effect.runPromise(Effect.flip(sidecar.connectionInfo))

    expect(error.message).toContain("could not be started")
  })

  it("fails startup on a timeout with no ready line", async () => {
    const { sidecar, children } = await run(() => {}, {
      timings: { startupMs: 30, maxRestarts: 0 },
    })

    await until(() => sidecar.status() === "failed")

    // The silent child was stopped by closing stdin.
    expect(children[0].stdinClosed).toBe(1)
  })

  it.each([
    ["a malformed line", "hello\n"],
    ["a non-loopback address", "TAILSHARE_READY http://0.0.0.0:80\n"],
    ["oversized output", "x".repeat(5000)],
  ])("fails startup on %s", async (_name, output) => {
    const { sidecar } = await run((child) => child.print(output), {
      timings: { maxRestarts: 0 },
    })

    await until(() => sidecar.status() === "failed")
  })

  it("makes a waiting caller fail with a plain sentence once it gives up", async () => {
    const { sidecar } = await run((child) => child.end("exited (1)"), {
      timings: { maxRestarts: 1 },
    })

    const error = await Effect.runPromise(Effect.flip(sidecar.connectionInfo))

    expect(error.message).toBe(
      "The sidecar could not be started. Restart Tailshare."
    )
  })
})

describe("sidecar restarts", () => {
  it("restarts after a crash and keeps going when the next one is fine", async () => {
    const { sidecar, children } = await run((child, index) => {
      child.print(READY)
      if (index === 0) queueMicrotask(() => child.end("exited (1)"))
    })

    await until(() => children.length === 2 && sidecar.status() === "ready")
  })

  it("tells listeners about restarting and ready", async () => {
    const seen: string[] = []
    const { sidecar, children } = await run((child, index) => {
      child.print(READY)
      if (index === 0) setTimeout(() => child.end("exited (1)"), 20)
    })
    sidecar.onStatus((status) => seen.push(status))

    await until(() => children.length === 2 && sidecar.status() === "ready")

    // The first "ready" may land before we subscribe; the restart must show.
    expect(seen.slice(-2)).toEqual(["restarting", "ready"])
  })

  it("stops after the cap and reports failed", async () => {
    const { sidecar, children } = await run(
      (child) => child.end("exited (1)"),
      {
        timings: { maxRestarts: 2 },
      }
    )

    await until(() => sidecar.status() === "failed")
    await new Promise((resolve) => setTimeout(resolve, 80))

    // One first start plus two restarts, then no more.
    expect(children).toHaveLength(3)
  })

  it("resets the count after a stable run", async () => {
    // maxRestarts is 0, so one unstable crash would end it. A stable run that
    // ends must still lead to a fresh start.
    const { sidecar, children } = await run(
      (child, index) => {
        child.print(READY)
        if (index === 0) setTimeout(() => child.end("exited (0)"), 30)
      },
      { timings: { maxRestarts: 0, stableMs: 10 } }
    )

    await until(() => children.length === 2 && sidecar.status() === "ready")
  })

  it("uses a fresh token for every start", async () => {
    let n = 0
    const tokens: string[] = []
    const children: FakeChild[] = []
    const scope = Effect.runSync(Scope.make())
    const sidecar = await Effect.runPromise(
      makeSidecar(
        {
          spawn: (token) => {
            tokens.push(token)
            const child = new FakeChild()
            children.push(child)
            queueMicrotask(() => {
              child.print(READY)
              if (children.length === 1) child.end("exited (1)")
            })
            return child
          },
          newToken: () => `${++n}`.padStart(64, "0"),
          health: () => Promise.resolve(),
        },
        FAST
      ).pipe(Effect.provideService(Scope.Scope, scope))
    )
    open.push(() =>
      Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)))
    )

    await until(() => sidecar.status() === "ready" && tokens.length === 2)

    expect(new Set(tokens).size).toBe(2)
  })
})

describe("sidecar shutdown", () => {
  it("closes stdin and does not kill a polite child", async () => {
    const { sidecar, children, stop } = await run((child) => child.print(READY))
    await Effect.runPromise(sidecar.connectionInfo)

    await stop()

    expect(children[0].stdinClosed).toBe(1)
    expect(children[0].killed).toBe(0)
  })

  it("kills a child that ignores the closed stdin", async () => {
    const { sidecar, children, stop } = await run((child) => {
      child.polite = false
      child.print(READY)
    })
    await Effect.runPromise(sidecar.connectionInfo)

    await stop()

    expect(children[0].stdinClosed).toBe(1)
    expect(children[0].killed).toBe(1)
  })

  it("does not restart once we are quitting", async () => {
    const { sidecar, children, stop } = await run((child) => child.print(READY))
    await Effect.runPromise(sidecar.connectionInfo)

    await stop()
    // The exit a quit causes (and any late one) must not start a new child.
    children[0].end("exited (1)")
    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(children).toHaveLength(1)
  })

  it("does not restart while a backoff is pending", async () => {
    const { sidecar, children, stop } = await run(
      (child) => child.end("exited (1)"),
      { timings: { backoffMs: 100, maxBackoffMs: 100, maxRestarts: 5 } }
    )
    await until(() => sidecar.status() === "restarting")

    await stop()
    await new Promise((resolve) => setTimeout(resolve, 250))

    expect(children).toHaveLength(1)
  })

  it("stops a child that is still starting", async () => {
    const { children, stop } = await run(() => {})
    await until(() => children.length === 1)

    await stop()

    expect(children[0].stdinClosed).toBe(1)
  })
})
