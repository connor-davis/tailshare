import { t } from "./i18n/index"
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
        title: t("notify.sendWithTailshare"),
        body: t("notify.openARoomThenSendAgain"),
      }
    case "join":
      return {
        title: t("notify.someoneWantsToJoin"),
        body: t("notify.joinRequest", {
          name: clean || t("common.someone"),
        }),
      }
    case "done":
      return {
        title: t("notify.transferFinished"),
        body: t("notify.transferDone", { name: clean || t("common.file") }),
      }
    case "failed":
      return {
        title: t("notify.transferFailed"),
        body: t("notify.transferFailedBody", {
          name: clean || t("common.file"),
        }),
      }
  }
}

/** Registers the toast request behind the window guard and the setting. */
export function registerNotifyIpc(host: IpcHost, notify: NotifyHost) {
  host.handle(CHANNELS.notify, async (senderOk, args) => {
    if (!senderOk || args.length !== 1)
      throw new Error(t("notify.tailshareCouldNotReadThatRequest"))

    let request: { kind: NotifyKind; name: string }
    try {
      request = await Effect.runPromise(check(NotifySchema, args[0]))
    } catch {
      throw new Error(t("notify.tailshareCouldNotReadThatRequest"))
    }

    if (!notify.enabled() || notify.windowActive()) return
    notify.show(toastText(request.kind, request.name))
  })
}
