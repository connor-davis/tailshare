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
    // Made from the desktop logo (web/apps/desktop/build/logo.svg).
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    platforms: ["android"],
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "Tailshare uses the camera to scan a room code.",
          recordAudioAndroid: false,
        },
      ],
    ],
    android: {
      // Never change this: sideloaded updates only install over the same id.
      package: "connor.davis.tailshare",
      versionCode: Number(process.env.TAILSHARE_VERSION_CODE ?? "1"),
      // The arrows sit inside the safe circle, so any launcher mask keeps them whole.
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#FA7A00",
      },
      // Puts Tailshare in the Android share sheet for one or many files.
      intentFilters: [
        "android.intent.action.SEND",
        "android.intent.action.SEND_MULTIPLE",
      ].map((action) => ({
        action,
        category: ["android.intent.category.DEFAULT"],
        data: [{ mimeType: "*/*" }],
      })),
    },
  }
}
