import { Effect } from "effect"
import type { NotifyKind } from "../shared/bridge"
import { CHANNELS, NotifySchema } from "../shared/ipc-schema"
import { check, type IpcHost } from "./ipc"

/** Longest name shown in a toast, in characters. */
const MAX_NAME = 64

/** What main needs to show a toast. */
export interface NotifyHost {
  /** The "Notifications" setting. */
  enabled(): boolean
  /** True while the window is visible and has focus, so a toast would only nag. */
  windowActive(): boolean
  /** Shows one toast. */
  show(toast: { title: string; body: string }): void
}

/**
 * Builds the toast words from the kind and a name from the page. The name is
 * cut to a base name for files, stripped of control characters and clamped, so
 * a peer's name or a path never reaches the screen raw.
 */
export function toastText(kind: NotifyKind, name: string) {
  const base = kind === "join" ? name : (name.split(/[\\/]/).pop() ?? name)

  const clean = Array.from(base.replace(/\p{Cc}/gu, "").trim())
    .slice(0, MAX_NAME)
    .join("")

  switch (kind) {
    case "send":
      return {
        title: "Send with Tailshare",
        body: "Open a room, then send again.",
      }
    case "join":
      return {
        title: "Someone wants to join",
        body: `${clean || "Someone"} is asking to join your room.`,
      }
    case "done":
      return {
        title: "Transfer finished",
        body: `${clean || "A file"} is done.`,
      }
    case "failed":
      return {
        title: "Transfer failed",
        body: `${clean || "A file"} did not finish.`,
      }
  }
}

/** Registers the toast request behind the window guard and the setting. */
export function registerNotifyIpc(host: IpcHost, notify: NotifyHost) {
  host.handle(CHANNELS.notify, async (senderOk, args) => {
    if (!senderOk || args.length !== 1)
      throw new Error("Tailshare could not read that request.")

    let request: { kind: NotifyKind; name: string }
    try {
      request = await Effect.runPromise(check(NotifySchema, args[0]))
    } catch {
      throw new Error("Tailshare could not read that request.")
    }

    if (!notify.enabled() || notify.windowActive()) return
    notify.show(toastText(request.kind, request.name))
  })
}
