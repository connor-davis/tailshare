import { t } from "../../i18n"
import type { en } from "../../i18n/en"

// Coarse codes such as bad_request carry different messages on different
// routes. Leave them on the safe English fallback rather than hide the cause.
const messages = {
  unauthorized: "api.unauthorized",
  forbidden: "api.forbidden",
  internal: "api.internal",
  not_connected: "api.notConnected",
  bad_path: "api.badPath",
  exists: "api.exists",
  denied: "api.denied",
  not_file: "api.notFile",
  join_denied: "api.joinDenied",
  busy: "api.busy",
  share_full: "api.shareFull",
  not_admitter: "api.notAdmitter",
  not_sharing: "api.notSharing",
  limit: "api.appLimit",
} as const satisfies Record<string, keyof typeof en>

/** Translate a known stable API code, preserving unknown English messages. */
export function errorMessage(code: string, fallback: string): string {
  return Object.hasOwn(messages, code)
    ? t(messages[code as keyof typeof messages])
    : fallback
}
