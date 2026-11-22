import { useColorScheme } from "react-native"

/** Polyphron orange on black, with a light twin. */
const palettes = {
  dark: {
    background: "#0a0a0a",
    surface: "#171717",
    text: "#f5f5f5",
    muted: "#a3a3a3",
    border: "#262626",
    primary: "#fa7a00",
    onPrimary: "#0a0a0a",
    error: "#ff6b6b",
  },
  light: {
    background: "#ffffff",
    surface: "#f5f5f5",
    text: "#111111",
    muted: "#555555",
    border: "#e5e5e5",
    primary: "#fa7a00",
    onPrimary: "#111111",
    error: "#c62828",
  },
}

/** The colours for the phone's current light or dark setting. */
export function useTheme() {
  return useColorScheme() === "light" ? palettes.light : palettes.dark
}
