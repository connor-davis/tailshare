import type { RequestOptions } from "node:http"
import type { AppUpdater } from "electron-updater"
import { GitHubProvider } from "electron-updater/out/providers/GitHubProvider.js"
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider.js"
import {
  Arm64GitHubProvider,
  configureWindowsArmUpdates,
  windowsUpdateChannel,
} from "./update-provider"
import { EventEmitter } from "node:events"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CHECK_EVERY_MS,
  createUpdater,
  releaseNotesToMarkdown,
  type UpdaterAdapter,
} from "./updater"

function setup(packaged = true, isPortable = false) {
  const events = new EventEmitter()
  let channel = "latest"
  const adapter: UpdaterAdapter = {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    allowDowngrade: false,
    get channel() {
      return channel
    },
    set channel(value) {
      channel = value!
      this.allowDowngrade = true
    },
    checkForUpdates: vi.fn(async () => null),
    downloadUpdate: vi.fn(async () => []),
    on: (event, listener) => events.on(event, listener),
    removeListener: (event, listener) => events.removeListener(event, listener),
    quitAndInstall: vi.fn(),
  }
  const shutdown = vi.fn(async () => {})
  const send = vi.fn()
  const controller = createUpdater({
    packaged,
    isPortable,
    adapter,
    channel: "latest",
    shutdown,
    send,
  })
  return { adapter, controller, events, shutdown, send }
}

afterEach(() => vi.useRealTimers())
const settle = () =>
  new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)))

describe("updater", () => {
  it("keeps portable copies off the feed across channel changes and explicit actions", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup(true, true)
    controller.setChannel("nightly")
    controller.checkNow()
    await controller.download()
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 5)
    expect(controller.status()).toEqual({
      state: "disabled",
      reason: "portable",
    })
    expect(events.eventNames()).toEqual([])
    expect(adapter.checkForUpdates).not.toHaveBeenCalled()
    expect(adapter.downloadUpdate).not.toHaveBeenCalled()
    await expect(controller.restart()).rejects.toThrow("No update")
    expect(adapter.quitAndInstall).not.toHaveBeenCalled()
    controller.stop()
  })

  it("does nothing in development", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup(false)
    await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000)
    expect(adapter.checkForUpdates).not.toHaveBeenCalled()
    expect(events.eventNames()).toEqual([])
    expect(controller.status()).toEqual({ state: "disabled" })
    await expect(controller.restart()).rejects.toThrow("No update")
    controller.stop()
  })

  it("checks on start and every two minutes, and stops cleanly", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup()
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(adapter.autoDownload).toBe(false)
    expect(adapter.autoInstallOnAppQuit).toBe(false)
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(2)
    controller.stop()
    expect(events.eventNames()).toEqual([])
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it("checks now once, and ignores the button while a check runs or an update is ready", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup()
    await settle()
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(1)

    controller.checkNow()
    await settle()
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(2)

    // A check that is still running swallows the click.
    let finish: () => void = () => {}
    vi.mocked(adapter.checkForUpdates).mockReturnValueOnce(
      new Promise((resolve) => (finish = () => resolve(null)))
    )
    controller.checkNow()
    controller.checkNow()
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(3)
    finish()
    await settle()

    events.emit("update-downloaded")
    controller.checkNow()
    await settle()
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(3)
    controller.stop()
  })

  it("offers releases without downloading and replaces them on later checks", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup()
    await settle()
    events.emit("update-available", {
      version: "1.0.1",
      releaseNotes: "<p>First</p>",
    })
    expect(controller.status()).toEqual({
      state: "available",
      version: "1.0.1",
      notes: "First",
    })
    expect(adapter.downloadUpdate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(controller.status().state).toBe("available")
    events.emit("update-available", {
      version: "1.0.2",
      releaseNotes: "<li>Second</li>",
    })
    expect(controller.status()).toEqual({
      state: "available",
      version: "1.0.2",
      notes: "- Second",
    })
    controller.stop()
  })

  it("downloads only once from available and never checks during downloading or ready", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup()
    await settle()
    await controller.download()
    expect(adapter.downloadUpdate).not.toHaveBeenCalled()
    let finish!: () => void
    vi.mocked(adapter.downloadUpdate).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    events.emit("update-available", { version: "1.0.1" })
    const downloading = controller.download()
    await controller.download()
    expect(controller.status()).toEqual({ state: "downloading", percent: 0 })
    expect(adapter.downloadUpdate).toHaveBeenCalledOnce()
    controller.checkNow()
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(1)
    finish()
    await downloading
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(1)
    events.emit("update-downloaded")
    controller.checkNow()
    await controller.download()
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
    expect(controller.status().state).toBe("ready")
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(adapter.downloadUpdate).toHaveBeenCalledOnce()
    controller.stop()
  })

  it("reports download errors and defers channel changes until the download ends", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup()
    await settle()
    events.emit("update-available", { version: "1.0.1" })
    vi.mocked(adapter.downloadUpdate).mockRejectedValueOnce(
      new Error("private")
    )
    await controller.download()
    expect(controller.status()).toEqual({ state: "error" })

    events.emit("update-available", { version: "1.0.1" })
    let finish!: () => void
    vi.mocked(adapter.downloadUpdate).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const downloading = controller.download()
    controller.setChannel("nightly")
    events.emit("update-downloaded")
    expect(adapter.channel).toBe("latest")
    finish()
    await downloading
    await settle()
    expect(adapter.channel).toBe("nightly")
    expect(controller.status().state).toBe("checking")
    controller.stop()
  })

  it("never overlaps checks or downloads and defers a channel switch", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup()
    await settle()
    let finish!: () => void
    const download = new Promise<void>((resolve) => {
      finish = resolve
    })
    vi.mocked(adapter.checkForUpdates).mockResolvedValue({
      downloadPromise: download,
    })
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
    controller.setChannel("nightly")
    events.emit("update-downloaded")
    expect(controller.status().state).toBe("checking")
    await expect(controller.restart()).rejects.toThrow("No update")
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(adapter.channel).toBe("latest")
    finish()
    await settle()
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(3)
    expect(adapter.channel).toBe("nightly")
    expect(adapter.allowPrerelease).toBe(true)
    expect(adapter.allowDowngrade).toBe(false)
    controller.stop()
  })

  it("returns to stable without allowing downgrade and checks again after a network error", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events } = setup()
    await settle()
    controller.setChannel("nightly")
    await settle()
    vi.mocked(adapter.checkForUpdates).mockRejectedValueOnce(
      new Error("offline")
    )
    controller.setChannel("latest")
    await settle()
    expect(adapter.channel).toBe("latest")
    expect(adapter.allowPrerelease).toBe(false)
    expect(adapter.allowDowngrade).toBe(false)
    expect(controller.status().state).toBe("error")
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS)
    events.emit("update-not-available")
    expect(controller.status().state).toBe("current")
    controller.stop()
  })

  it("normalizes events and waits for sidecar shutdown before installation", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events, shutdown } = setup()
    events.emit("download-progress", { percent: 120 })
    expect(controller.status()).toEqual({ state: "downloading", percent: 100 })
    events.emit("download-progress", { percent: NaN })
    expect(controller.status().percent).toBe(0)
    let finish!: () => void
    shutdown.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    events.emit("update-downloaded")
    const restart = controller.restart()
    expect(shutdown).toHaveBeenCalledOnce()
    expect(adapter.quitAndInstall).not.toHaveBeenCalled()
    await expect(controller.restart()).rejects.toThrow("No update")
    finish()
    await restart
    expect(adapter.quitAndInstall).toHaveBeenCalledOnce()
    controller.stop()
  })

  it("never installs when shutdown fails", async () => {
    vi.useFakeTimers()
    const { adapter, controller, events, shutdown } = setup()
    shutdown.mockRejectedValueOnce(new Error("still running"))
    events.emit("update-downloaded")
    await expect(controller.restart()).rejects.toThrow("could not restart")
    expect(adapter.quitAndInstall).not.toHaveBeenCalled()
    controller.stop()
  })
})

describe("release notes as Markdown", () => {
  it.each([
    [null, "No release notes."],
    [undefined, "No release notes."],
    [[], "No release notes."],
    [
      "<p>One</p><ul><li>A &amp; B</li><li>Two</li></ul>",
      "One\n\n- A & B\n\n- Two",
    ],
    [
      '<script src="x">bad()</script><style>body{}</style><p onclick="bad()">Safe</p>',
      "Safe",
    ],
    [
      '<a title="x > y" href="javascript:bad()">Link</a><img src=x onerror=bad()>',
      "Link",
    ],
    [
      "&lt;script&gt;literal&lt;/script&gt; &amp;lt;b&amp;gt; &#x41;&#66; &quot; &apos; &nbsp; &#0;",
      "<script>literal</script> &lt;b&gt; AB \" '   �",
    ],
    [
      [
        { version: "2", note: "<p>New</p>" },
        { version: "1", note: "Old" },
        null,
      ],
      "2\n\nNew\n\n1\nOld",
    ],
    ["<p> One </p>\n\n\n<p>Two</p>", "One\n\nTwo"],
    ["<script>unfinished", "No release notes."],
    ["<!-- private --><custom data-x='x'>Visible</custom>", "Visible"],
    [
      "<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>",
      "# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six",
    ],
    [
      "<strong>Bold</strong> <b>also bold</b> <em>Italic</em> <i>also italic</i> <code>run()</code>",
      "**Bold** **also bold** _Italic_ _also italic_ `run()`",
    ],
    [
      "<ul><li>Parent<ul><li>Child<ol><li>Deep</li></ol></li></ul></li><li>Next</li></ul>",
      "- Parent\n\n  - Child\n\n    - Deep\n\n- Next",
    ],
    ["<ul><li><p>First</p></li><li>Second</li></ul>", "- First\n\n- Second"],
    [
      '<pre><code class="language-js">if (a &lt; b) {\n  run()\n}</code></pre>',
      "```\nif (a < b) {\n  run()\n}\n```",
    ],
    ["<pre><code>```</code></pre>", "````\n```\n````"],
    [
      '<a href="https://github.com/team/repo/pull/1">Fix</a>',
      "[Fix](https://github.com/team/repo/pull/1)",
    ],
    [
      "<a href='https://example.com/a(b)?a=1&amp;b=2'><strong>More</strong></a>",
      "[**More**](https://example.com/a%28b%29?a=1&b=2)",
    ],
    [
      '<a href="http://github.com/">HTTP</a> <a href="javascript:bad()">Bad</a> <a href="/relative">Relative</a> <a>No link</a>',
      "HTTP Bad Relative No link",
    ],
    ["<div>One<br>Two</div><p>Three</p>", "One\nTwo\n\nThree"],
    [
      "## Native Markdown\n\n- **Kept**\n  - Child",
      "## Native Markdown\n\n- **Kept**\n  - Child",
    ],
  ])("converts %j safely", (source, expected) => {
    expect(releaseNotesToMarkdown(source)).toBe(expected)
  })

  it("caps notes at 20,000 characters", () => {
    expect(releaseNotesToMarkdown("x".repeat(21_000))).toHaveLength(20_000)
  })
})

describe("Windows update feeds", () => {
  it.each([
    ["latest", "x64", "latest"],
    ["nightly", "x64", "nightly"],
    ["latest", "arm64", "latest-arm64"],
    ["nightly", "arm64", "nightly-arm64"],
  ])("selects %s for %s as %s", (channel, arch, expected) => {
    expect(windowsUpdateChannel(channel, arch)).toBe(expected)
  })

  it("keeps the x64 provider configuration untouched", () => {
    const updater = { setFeedURL: vi.fn() }
    configureWindowsArmUpdates(updater, "win32", "x64")
    configureWindowsArmUpdates(updater, "darwin", "arm64")
    expect(updater.setFeedURL).not.toHaveBeenCalled()
    configureWindowsArmUpdates(updater, "win32", "arm64")
    expect(updater.setFeedURL).toHaveBeenCalledExactlyOnceWith({
      provider: "custom",
      updateProvider: Arm64GitHubProvider,
    })
  })

  it.each(["latest", "nightly"] as const)(
    "resolves real GitHub %s tags to separate per-arch manifests",
    async (channel) => {
      vi.useFakeTimers()
      const { adapter, controller } = setup()
      await settle()
      controller.setChannel(channel)
      await settle()
      expect(adapter.channel).toBe(channel)
      expect(adapter.allowPrerelease).toBe(channel === "nightly")
      const version =
        channel === "nightly" ? "0.1.4-nightly.202611221200" : "0.1.4"
      const tag = `v${version}`
      const atom = `<feed><entry><title>Tailshare</title><link href="https://github.com/connor-davis/tailshare/releases/tag/${tag}"/><content>Notes</content></entry></feed>`
      for (const arch of ["x64", "arm64"]) {
        const manifest = `${windowsUpdateChannel(channel, arch)}.yml`
        const request = vi.fn(async (options: RequestOptions) => {
          if (options.path?.endsWith(".atom")) return atom
          if (options.path?.endsWith("/latest"))
            return JSON.stringify({ tag_name: tag })
          if (options.path?.endsWith(`/${manifest}`))
            return `version: ${version}\npath: Tailshare-Setup-${version}${arch === "arm64" ? "-arm64" : ""}.exe\nsha512: abc\nreleaseNotes: Notes\n`
          throw new Error(`Unexpected request: ${options.path}`)
        })
        const updater = {
          channel: adapter.channel,
          allowPrerelease: adapter.allowPrerelease,
          fullChangelog: false,
        } as AppUpdater
        const runtime = {
          platform: "win32",
          isUseMultipleRangeRequest: false,
          executor: { request },
        } as unknown as ProviderRuntimeOptions
        const provider =
          arch === "arm64"
            ? new Arm64GitHubProvider({ provider: "custom" }, updater, runtime)
            : new GitHubProvider(
                {
                  provider: "github",
                  owner: "connor-davis",
                  repo: "tailshare",
                },
                updater,
                runtime
              )
        const info = await provider.getLatestVersion()
        expect(info.version).toBe(version)
        expect(request.mock.calls.map(([options]) => options.path)).toEqual([
          "/connor-davis/tailshare/releases.atom",
          ...(channel === "latest"
            ? ["/connor-davis/tailshare/releases/latest"]
            : []),
          `/connor-davis/tailshare/releases/download/${tag}/${manifest}`,
        ])
        expect(provider.resolveFiles(info)[0]!.url.pathname).toContain(
          arch === "arm64" ? "-arm64.exe" : `${version}.exe`
        )
      }
      controller.stop()
    }
  )

  it("keeps nightly fallback on the ARM64 feed", async () => {
    const tag = "v0.1.4-nightly.202611221200"
    const request = vi.fn(async (options: RequestOptions) => {
      if (options.path?.endsWith(".atom"))
        return `<feed><entry><title>Tailshare</title><link href="https://github.com/connor-davis/tailshare/releases/tag/${tag}"/><content>Notes</content></entry></feed>`
      if (options.path?.endsWith("/nightly-arm64.yml"))
        throw new Error("missing")
      if (options.path?.endsWith("/latest-arm64.yml"))
        return "version: 0.1.4\nreleaseNotes: Notes\n"
      throw new Error("Wrong architecture feed")
    })
    const provider = new Arm64GitHubProvider(
      { provider: "custom" },
      { channel: "nightly", allowPrerelease: true } as AppUpdater,
      {
        platform: "win32",
        executor: { request },
      } as unknown as ProviderRuntimeOptions
    )
    expect((await provider.getLatestVersion()).version).toBe("0.1.4")
    expect(request).toHaveBeenCalledTimes(3)
  })
})
