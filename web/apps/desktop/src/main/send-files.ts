import { existsSync } from "node:fs"
import { isAbsolute } from "node:path"
import type { AddFilesResult, CurrentRoom } from "../shared/bridge"

/** Reads only explicit, existing absolute --send paths; paths never enter logs. */
export function findSendPaths(
  argv: readonly string[],
  exists: (path: string) => boolean = existsSync
): string[] {
  const paths: string[] = []
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] !== "--send") continue

    const path = argv[++index]
    if (!path || !isAbsolute(path) || path.includes("\0")) continue

    try {
      if (exists(path)) paths.push(path)
    } catch {
      // A bad or inaccessible argument is ignored without exposing the path.
    }
  }

  return paths
}

/** Groups Explorer's one-process-per-file launches into one batch after 500 ms. */
export function createSendBatch(send: (paths: string[]) => Promise<void>) {
  let pending: string[] = []

  let timer: ReturnType<typeof setTimeout> | undefined

  let running = Promise.resolve()

  return {
    push(paths: readonly string[]) {
      if (!paths.length) return

      pending.push(...paths)
      clearTimeout(timer)
      timer = setTimeout(() => {
        const batch = pending
        pending = []
        running = running
          .then(() => send(batch))
          .catch(() => {
            // Callers show bounded error text. Raw paths and upstream errors stay private.
          })
      }, 500)
    },
  }
}

/** Sends one Explorer batch through the same import path as the native picker. */
export async function sendToOpenRoom(
  paths: string[],
  host: {
    currentRoom(): CurrentRoom | null
    connected(): Promise<boolean>
    add(paths: string[]): Promise<AddFilesResult>
    post(name: string, roomCode: string): Promise<void>
    showWindow(): void
    noRoom(): void
  }
) {
  host.showWindow()

  const room = host.currentRoom()
  if (
    !room ||
    !(await host.connected()) ||
    host.currentRoom()?.code !== room.code
  ) {
    host.noRoom()
    return
  }

  const result = await host.add(paths)
  for (const added of result.added) {
    if (host.currentRoom()?.code !== room.code) return

    await host.post(added.name, room.code)
  }
}
