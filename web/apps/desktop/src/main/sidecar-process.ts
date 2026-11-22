import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import type { SidecarChild } from "./sidecar"

/** A fresh token: 32 random bytes as 64 hex characters. Never logged. */
export function newToken(): string {
  return randomBytes(32).toString("hex")
}

/**
 * Starts the real sidecar. Stdin is a pipe we keep open: the sidecar exits when
 * it closes, so even a crashed Electron cannot leave it running. Stderr is
 * drained and dropped so a full pipe can never stall it.
 */
export function spawnSidecar(
  binary: string,
  token: string,
  roomsDir: string,
  mainToken: string,
  identity?: string,
  relayRegion = "303"
): SidecarChild {
  const child = spawn(binary, ["serve"], {
    env: {
      ...process.env,
      TAILSHARE_ADDR: "127.0.0.1:0",
      TAILSHARE_TOKEN: token,
      TAILSHARE_MAIN_TOKEN: mainToken,
      TAILSHARE_ROOMS_DIR: roomsDir,
      TAILSHARE_REGION: relayRegion,
      // Only the sidecar ever sees this secret join key.
      ...(identity ? { TAILSHARE_IDENTITY: identity } : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })

  child.stderr.resume()
  child.stdout.setEncoding("utf8")

  // Late listeners hear about an exit that already happened.
  let exitReason: string | null = null
  const listeners: Array<(reason: string) => void> = []
  const finish = (reason: string) => {
    if (exitReason !== null) return
    exitReason = reason
    listeners.forEach((listener) => listener(reason))
  }
  child.once("exit", (code, signal) =>
    finish(`exited (${code ?? signal ?? "unknown"})`)
  )
  child.once("error", (error) => finish(error.message))

  // A closed pipe after exit is normal; never let it throw.
  child.stdin.on("error", () => {})

  return {
    onStdout: (listener) => child.stdout.on("data", listener),
    onExit: (listener) => {
      if (exitReason !== null) listener(exitReason)
      else listeners.push(listener)
    },
    closeStdin: () => child.stdin.end(),
    // ponytail: the sidecar starts no children, so a plain kill is enough.
    // If it ever does, switch to `taskkill /T` on Windows.
    kill: () => child.kill(),
  }
}
