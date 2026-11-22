import { t } from "./i18n/index"
import type { UpdateChannel, UpdateStatus } from "../shared/bridge"

/** The electron-updater surface, kept injectable for offline tests. */
export interface UpdaterAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  channel: string | null
  checkForUpdates(): Promise<{
    downloadPromise?: Promise<unknown> | null
  } | null>
  downloadUpdate(): Promise<unknown>
  on(event: string, listener: (...args: unknown[]) => void): unknown
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown
  quitAndInstall(): void
}

/** How often a packaged build looks for an update: 30 requests an hour, under GitHub's unauthenticated limit. */
export const CHECK_EVERY_MS = 2 * 60 * 1000

/** Converts feed HTML to bounded Markdown without passing HTML to the renderer. */
export function releaseNotesToMarkdown(value: unknown): string {
  const source =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value
            .map((entry: unknown) => {
              if (
                !entry ||
                typeof entry !== "object" ||
                !("note" in entry) ||
                typeof entry.note !== "string"
              )
                return ""
              const version =
                "version" in entry && typeof entry.version === "string"
                  ? `${entry.version}\n`
                  : ""
              return version + entry.note
            })
            .join("\n\n")
        : ""
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  }

  let listDepth = 0
  let preformatted = false
  const links: string[] = []
  // A longer fence keeps backticks in code from ending its block early.
  const fence = "`".repeat(
    (source.match(/`+/g) ?? []).reduce(
      (longest, run) => Math.max(longest, run.length + 1),
      3
    )
  )

  // Decode only after stripping tags; encoded HTML never becomes a tag here.
  const text = source
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(
      /<\/?[a-z!][^>"']*(?:"[^"]*"[^>"']*|'[^']*'[^>"']*)*>/gi,
      (tag) => {
        const name = /^<\/?([a-z0-9]+)/i.exec(tag)?.[1]?.toLowerCase()
        const closing = tag.startsWith("</")
        if (name === "pre") {
          preformatted = !closing
          return closing ? `\n${fence}\n\n` : `\n\n${fence}\n`
        }
        if (preformatted) return ""

        if (name === "ul" || name === "ol") {
          listDepth = Math.max(0, listDepth + (closing ? -1 : 1))
          return "\n"
        }
        if (name === "li")
          return closing
            ? "\n"
            : `\n${"  ".repeat(Math.max(0, listDepth - 1))}- `
        if (name && /^h[1-6]$/.test(name))
          return closing ? "\n\n" : `\n\n${"#".repeat(Number(name[1]))} `
        if (name === "strong" || name === "b") return "**"
        if (name === "em" || name === "i") return "_"
        if (name === "code") return "`"

        if (name === "a") {
          if (closing) {
            const href = links.pop()
            return href ? `](${href})` : ""
          }
          const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
            tag
          )
          const target = href?.[1] ?? href?.[2] ?? href?.[3] ?? ""
          let safe = ""
          try {
            const url = new URL(target)
            if (/^https:\/\//i.test(target) && url.protocol === "https:")
              safe = url.href.replace(/\(/g, "%28").replace(/\)/g, "%29")
          } catch {
            /* Invalid destinations remain text. */
          }
          links.push(safe)
          return safe ? "[" : ""
        }
        if (name === "br") return "\n"
        if (name === "p" || name === "div")
          return listDepth ? (closing ? "\n" : "") : "\n\n"
        return ""
      }
    )
    .replace(
      /&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,
      (entity, name: string) => {
        if (!name.startsWith("#")) return entities[name.toLowerCase()] ?? entity
        const code =
          name[1]?.toLowerCase() === "x"
            ? parseInt(name.slice(2), 16)
            : Number(name.slice(1))
        return code > 0 &&
          code <= 0x10ffff &&
          !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : "�"
      }
    )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return text.slice(0, 20_000) || t("updater.noReleaseNotes")
}

/** Starts one packaged updater; development never touches the network or timers. */
export function createUpdater(options: {
  packaged: boolean
  adapter: UpdaterAdapter
  channel: UpdateChannel
  send: (status: UpdateStatus) => void
  shutdown: () => Promise<void>
  every?: (callback: () => void, milliseconds: number) => () => void
  log?: (error: unknown) => void
}) {
  const adapter = options.adapter
  let status: UpdateStatus = { state: "disabled" }
  let desired = options.channel
  let configured = desired
  let active = false
  let stopped = false
  let installing = false
  let recheck = false
  const listeners = new Map<string, (...args: unknown[]) => void>()
  let cancelTimer = () => {}

  function report(next: UpdateStatus) {
    if (stopped || desired !== configured) return
    status = next
    options.send({ ...status })
  }

  function configure() {
    configured = desired
    adapter.channel = configured
    adapter.allowPrerelease = configured === "nightly"
    // Setting channel enables downgrades upstream, so reset this afterwards.
    adapter.allowDowngrade = false
  }

  async function check() {
    if (!options.packaged || stopped || active || installing) return
    // A downloaded update waits for Restart; checking again would hide it.
    if (status.state === "ready" || status.state === "downloading") return
    active = true
    configure()
    if (status.state !== "available") report({ state: "checking" })

    try {
      const result = await adapter.checkForUpdates()
      // Keep the feed fixed until its download completes, too.
      await result?.downloadPromise
    } catch (error) {
      options.log?.(error)
      report({ state: "error" })
    } finally {
      active = false
      if (recheck && !stopped) {
        recheck = false
        void check()
      }
    }
  }

  function listen(event: string, listener: (...args: unknown[]) => void) {
    listeners.set(event, listener)
    adapter.on(event, listener)
  }

  function stop() {
    stopped = true
    cancelTimer()
    for (const [event, listener] of listeners)
      adapter.removeListener(event, listener)
    listeners.clear()
  }

  if (options.packaged) {
    adapter.autoDownload = false
    // Installation always passes through the sidecar shutdown below.
    adapter.autoInstallOnAppQuit = false
    listen("update-not-available", () => report({ state: "current" }))
    listen("update-available", (value) => {
      if (!value || typeof value !== "object" || !("version" in value)) return
      if (typeof value.version !== "string") return

      report({
        state: "available",
        version: value.version,
        notes: releaseNotesToMarkdown(
          "releaseNotes" in value ? value.releaseNotes : null
        ),
      })
    })
    listen("download-progress", (value) => {
      const percent =
        value && typeof value === "object" && "percent" in value
          ? value.percent
          : 0
      report({
        state: "downloading",
        percent:
          typeof percent === "number" && Number.isFinite(percent)
            ? Math.max(0, Math.min(100, percent))
            : 0,
      })
    })
    listen("update-downloaded", () => report({ state: "ready" }))
    listen("error", (error) => {
      options.log?.(error)
      report({ state: "error" })
    })

    const every =
      options.every ??
      ((callback, milliseconds) => {
        const timer = setInterval(callback, milliseconds)
        return () => clearInterval(timer)
      })
    cancelTimer = every(() => void check(), CHECK_EVERY_MS)
    void check()
  }

  return {
    status: (): UpdateStatus => ({ ...status }),
    setChannel(channel: UpdateChannel) {
      desired = channel
      status = { state: options.packaged ? "checking" : "disabled" }
      options.send({ ...status })
      if (active) recheck = true
      else void check()
    },
    /** Runs one check now. Ignored while a check or download runs, or an update is ready. */
    checkNow() {
      void check()
    },
    /** Downloads only the release the user has chosen to fetch. */
    async download() {
      if (
        !options.packaged ||
        stopped ||
        active ||
        installing ||
        status.state !== "available" ||
        desired !== configured
      )
        return
      active = true
      report({ state: "downloading", percent: 0 })

      try {
        await adapter.downloadUpdate()
      } catch (error) {
        options.log?.(error)
        report({ state: "error" })
      } finally {
        active = false
        if (recheck && !stopped) {
          recheck = false
          void check()
        }
      }
    },
    async restart() {
      if (
        !options.packaged ||
        stopped ||
        installing ||
        status.state !== "ready" ||
        desired !== configured
      ) {
        throw new Error(t("updater.noUpdateIsReadyWaitForThe"))
      }
      installing = true
      cancelTimer()

      try {
        await options.shutdown()
        adapter.quitAndInstall()
      } catch (error) {
        installing = false
        options.log?.(error)
        throw new Error(t("updater.tailshareCouldNotRestartToUpdateTry"), {
          cause: error,
        })
      }
    },
    stop,
  }
}

/** The updater operations exposed to the guarded IPC boundary. */
export type UpdateController = ReturnType<typeof createUpdater>
