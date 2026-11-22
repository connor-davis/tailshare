import type { ExpoConfig } from "expo/config"

/**
 * Expo config. CI passes the release version and an always-rising version
 * code through the environment so a newer build installs over an older one.
 */
export default function config(): ExpoConfig {
  return {
    name: "Tailshare",
    slug: "tailshare",
    version: process.env.TAILSHARE_VERSION_NAME ?? "0.0.0-dev",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    platforms: ["android"],
    android: {
      // Never change this: sideloaded updates only install over the same id.
      package: "connor.davis.tailshare",
      versionCode: Number(process.env.TAILSHARE_VERSION_CODE ?? "1"),
    },
  }
}
