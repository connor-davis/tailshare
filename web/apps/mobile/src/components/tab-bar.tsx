import { Pressable, StyleSheet, Text, View } from "react-native"

import { strings } from "../strings"
import type { Theme } from "../theme"

const tabs = ["files", "people", "apps", "chat", "transfers"] as const

/** One of the five room surfaces, in desktop Spaces order. */
export type RoomTab = (typeof tabs)[number]

// Plain text glyphs: no icon package is installed. U+FE0E asks Android for the text form,
// not a colour emoji.
const glyphs: Record<RoomTab, string> = {
  files: "▤",
  people: "☺︎",
  apps: "⊞",
  chat: "✉︎",
  transfers: "⇅",
}

/** Keeps room navigation above Android's bottom system controls. */
export function TabBar(props: {
  theme: Theme
  active: RoomTab
  /** Active transfers, shown as a badge on Transfers. */
  transferCount: number
  onSelect: (tab: RoomTab) => void
}) {
  const { theme, active, onSelect, transferCount } = props

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
          accessibilityLabel={
            tab === "transfers" && transferCount > 0
              ? `${strings[tab]}, ${transferCount} ${strings.active}`
              : strings[tab]
          }
          accessibilityState={{ selected: active === tab }}
          onPress={() => onSelect(tab)}
          style={[
            styles.tab,
            { borderTopColor: active === tab ? theme.primary : "transparent" },
          ]}
        >
          <Text
            style={[
              styles.glyph,
              { color: active === tab ? theme.link : theme.muted },
            ]}
          >
            {glyphs[tab]}
          </Text>
          {tab === "transfers" && transferCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <Text style={[styles.badgeText, { color: theme.onPrimary }]}>
                {transferCount}
              </Text>
            </View>
          ) : null}
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
  glyph: { fontSize: 20 },
  badge: {
    position: "absolute",
    top: 4,
    left: "55%",
    minWidth: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
  },
  badgeText: { fontSize: 11, fontWeight: "800" },
  label: { fontSize: 12, textAlign: "center" },
})
