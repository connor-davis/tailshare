import { useColorScheme } from "react-native"

const chrome = {
  chrome: "#000000",
  chromeText: "#FFFFFF",
  chromeMuted: "#B8B8BD",
  primary: "#FA7A00",
} as const

const palettes = {
  dark: {
    ...chrome,
    background: "#0F0F10",
    surface: "#171718",
    secondary: "#1E1E20",
    text: "#EDEDEE",
    muted: "#A1A1A7",
    border: "#262629",
    input: "#6B6B72",
    field: "#09090A",
    link: "#FA7A00",
    onPrimary: "#0F0F10",
    error: "#FF7B72",
  },
  light: {
    ...chrome,
    background: "#FAF9F6",
    surface: "#FFFFFF",
    secondary: "#FFFFFF",
    text: "#000000",
    muted: "#3D4650",
    border: "#D0D0CE",
    input: "#858585",
    field: "#EFEEE9",
    link: "#B85600",
    onPrimary: "#000000",
    error: "#D3212C",
  },
} as const

/** The phone's semantic Spaces colours in either system appearance. */
export type Theme = (typeof palettes)[keyof typeof palettes]

/** Uses the same light and dark tokens as the desktop Spaces shell. */
export function useTheme(): Theme {
  return useColorScheme() === "light" ? palettes.light : palettes.dark
}
