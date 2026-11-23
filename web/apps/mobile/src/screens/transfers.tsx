import { FlatList, StyleSheet, Text, View } from "react-native"

import type { TransferEvent } from "../../modules/tailshare-core"
import { formatSize } from "../lib/format"
import { strings } from "../strings"
import type { Theme } from "../theme"

/** The latest pushed snapshot of one transfer. */
export type Transfer = Extract<TransferEvent, { type: "transfer" }>

/** How many transfers are moving, failed (or canceled) and done. */
export function countTransfers(transfers: Transfer[]) {
  const done = transfers.filter((item) => item.state === "done").length
  const failed = transfers.filter(
    (item) => item.state === "failed" || item.state === "canceled"
  ).length

  return { active: transfers.length - done - failed, failed, done }
}

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
  return `${verb} ${item.name}  ${formatSize(item.done)} / ${formatSize(item.size)}`
}

/** Transfer sentences and bounded progress from native push events. */
export function TransfersScreen(props: {
  theme: Theme
  transfers: Transfer[]
}) {
  const { theme, transfers } = props
  const counts = countTransfers(transfers)
  const chips = [
    [counts.active, strings.active],
    [counts.failed, strings.failedCount],
    [counts.done, strings.done],
  ] as const

  return (
    <FlatList
      data={transfers}
      ListHeaderComponent={
        <View style={styles.chips}>
          {chips.map(([count, label]) => (
            <View
              key={label}
              style={[styles.chip, { backgroundColor: theme.field }]}
            >
              <Text style={[styles.chipText, { color: theme.muted }]}>
                {count} {label}
              </Text>
            </View>
          ))}
        </View>
      }
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {strings.noTransfers}
          </Text>
          <Text style={{ color: theme.muted }}>{strings.noTransfersHint}</Text>
        </View>
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
  chips: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 8 },
  chip: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", gap: 4, paddingVertical: 32 },
  emptyTitle: { fontSize: 17, fontWeight: "600" },
  item: { paddingVertical: 16, gap: 12, borderBottomWidth: 1 },
  track: { height: 6, borderRadius: 4, overflow: "hidden" },
  progress: { height: "100%" },
})
