import { Pressable, StyleSheet, Text, View } from "react-native"

import { strings } from "../strings"
import type { Theme } from "../theme"

const tabs = ["files", "people", "apps", "chat", "transfers"] as const

/** One of the five room surfaces, in desktop Spaces order. */
export type RoomTab = (typeof tabs)[number]

/** Keeps room navigation above Android's bottom system controls. */
export function TabBar(props: {
  theme: Theme
  active: RoomTab
  onSelect: (tab: RoomTab) => void
}) {
  const { theme, active, onSelect } = props

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab}
          accessibilityRole="tab"
          accessibilityLabel={strings[tab]}
          accessibilityState={{ selected: active === tab }}
          onPress={() => onSelect(tab)}
          style={[
            styles.tab,
            { borderTopColor: active === tab ? theme.primary : "transparent" },
          ]}
        >
          <Text
            style={[
              styles.label,
              {
                color: active === tab ? theme.link : theme.muted,
                fontWeight: active === tab ? "700" : "400",
              },
            ]}
          >
            {strings[tab]}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: 1, paddingBottom: 32 },
  tab: {
    flex: 1,
    minHeight: 56,
    borderTopWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  label: { fontSize: 12, textAlign: "center" },
})
