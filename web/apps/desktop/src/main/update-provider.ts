import type { CustomPublishOptions } from "builder-util-runtime"
import type { AppUpdater } from "electron-updater"
import { GitHubProvider } from "electron-updater/out/providers/GitHubProvider.js"
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider.js"

/** Chooses a Windows manifest without changing the release's prerelease tag. */
export function windowsUpdateChannel(channel: string, arch: string): string {
  return arch === "arm64" ? `${channel}-arm64` : channel
}

/** Keeps GitHub's nightly tag matching while selecting only ARM64 manifests. */
export class Arm64GitHubProvider extends GitHubProvider {
  constructor(
    _options: CustomPublishOptions,
    updater: AppUpdater,
    runtimeOptions: ProviderRuntimeOptions
  ) {
    super(
      { provider: "github", owner: "connor-davis", repo: "tailshare" },
      updater,
      runtimeOptions
    )
  }

  protected override getDefaultChannelName(): string {
    return windowsUpdateChannel("latest", "arm64")
  }

  protected override getCustomChannelName(channel: string): string {
    return windowsUpdateChannel(channel, "arm64")
  }
}

/** Leaves x64's built-in provider untouched; ARM64 uses separate feed files. */
export function configureWindowsArmUpdates(
  updater: Pick<AppUpdater, "setFeedURL">,
  platform: NodeJS.Platform,
  arch: string
): void {
  if (platform !== "win32" || arch !== "arm64") return

  updater.setFeedURL({
    provider: "custom",
    updateProvider: Arm64GitHubProvider,
  })
}
