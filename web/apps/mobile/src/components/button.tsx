import { Pressable, StyleSheet, Text } from "react-native"

import type { Theme } from "../theme"

/** A labelled action with a native-sized touch target. */
export function Button(props: {
  theme: Theme
  label: string
  onPress: () => void
  quiet?: boolean
  chrome?: boolean
}) {
  const { theme, label, onPress, quiet, chrome } = props
  const foreground = chrome ? theme.chromeText : theme.text

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          opacity: pressed ? 0.7 : 1,
          backgroundColor: quiet ? "transparent" : theme.primary,
          borderColor: chrome ? theme.chromeMuted : theme.input,
          borderWidth: quiet ? 1 : 0,
        },
      ]}
    >
      <Text
        style={[styles.text, { color: quiet ? foreground : theme.onPrimary }]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 6,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  text: { fontSize: 16, fontWeight: "600" },
})
