import { FlatList, StyleSheet, Text, View } from "react-native"

import type { TransferEvent } from "../../modules/tailshare-core"
import { strings } from "../strings"
import type { Theme } from "../theme"

/** The latest pushed snapshot of one transfer. */
export type Transfer = Extract<TransferEvent, { type: "transfer" }>

function transferLine(item: Transfer): string {
  if (item.state === "done") {
    return item.direction === "download"
      ? `${strings.savedTo} ${item.saved ?? item.name}`
      : `${strings.sent} ${item.name}`
  }

  if (item.state === "failed" || item.state === "canceled") {
    return `${strings.failed}: ${item.name}${item.reason ? ` (${item.reason})` : ""}`
  }

  const verb = item.direction === "download" ? strings.getting : strings.sending
  return `${verb} ${item.name}  ${item.done}/${item.size} ${strings.bytes}`
}

/** Transfer sentences and bounded progress from native push events. */
export function TransfersScreen(props: {
  theme: Theme
  transfers: Transfer[]
}) {
  const { theme, transfers } = props

  return (
    <FlatList
      data={transfers}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <Text style={{ color: theme.muted }}>{strings.noTransfers}</Text>
      }
      renderItem={({ item }) => {
        const progress =
          item.state === "done"
            ? 1
            : item.size > 0
              ? Math.min(1, Math.max(0, item.done / item.size))
              : 0
        const failed = item.state === "failed" || item.state === "canceled"
        const label = transferLine(item)

        return (
          <View style={[styles.item, { borderColor: theme.border }]}>
            <Text style={{ color: failed ? theme.error : theme.text }}>
              {label}
            </Text>
            <View
              accessibilityRole="progressbar"
              accessibilityLabel={item.name}
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(progress * 100),
                text: label,
              }}
              style={[styles.track, { backgroundColor: theme.secondary }]}
            >
              <View
                style={[
                  styles.progress,
                  {
                    backgroundColor: failed ? theme.error : theme.primary,
                    width: `${progress * 100}%`,
                  },
                ]}
              />
            </View>
          </View>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  item: { paddingVertical: 16, gap: 12, borderBottomWidth: 1 },
  track: { height: 6, borderRadius: 4, overflow: "hidden" },
  progress: { height: "100%" },
})
