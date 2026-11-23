import { Pressable, StyleSheet, Text, View } from "react-native"

import { strings } from "../strings"
import type { Theme } from "../theme"

/** A message strip with a red edge and a way to dismiss it. */
export function Alert(props: {
  theme: Theme
  message: string
  onDismiss: () => void
}) {
  const { theme } = props

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.alert,
        {
          backgroundColor: theme.surface,
          borderColor: theme.error,
        },
      ]}
    >
      <Text style={[styles.message, { color: theme.text }]}>
        {props.message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.dismiss}
        onPress={props.onDismiss}
        style={styles.close}
      >
        <Text style={[styles.closeGlyph, { color: theme.muted }]}>✕</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  alert: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderLeftWidth: 5,
    borderRadius: 6,
    paddingLeft: 14,
  },
  message: { flex: 1, paddingVertical: 10 },
  close: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  closeGlyph: { fontSize: 18 },
})
