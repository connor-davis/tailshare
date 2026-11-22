import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"

import type { RemoteEntry } from "../../modules/tailshare-core"
import { Button } from "../components/button"
import { strings } from "../strings"
import type { Theme } from "../theme"

/** The host's guarded folder browser and phone upload action. */
export function FilesScreen(props: {
  theme: Theme
  path: string
  entries: RemoteEntry[]
  loading: boolean
  onOpen: (path: string) => void
  onDownload: (entry: RemoteEntry) => void
  onSend: () => void
}) {
  const { theme, path, entries, loading, onOpen, onDownload, onSend } = props
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""

  return (
    <View style={styles.body}>
      <Text style={{ color: theme.muted }}>/{path}</Text>
      {path !== "" ? (
        <Button
          theme={theme}
          label={strings.up}
          onPress={() => onOpen(parent)}
          quiet
        />
      ) : null}
      <Button theme={theme} label={strings.send} onPress={onSend} />
      {loading ? (
        <ActivityIndicator
          color={theme.primary}
          accessibilityLabel={strings.loading}
        />
      ) : null}
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.name}
        ListEmptyComponent={
          loading ? undefined : (
            <Text style={{ color: theme.muted }}>{strings.empty}</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.name}
            onPress={() =>
              item.isDir
                ? onOpen(path === "" ? item.name : `${path}/${item.name}`)
                : onDownload(item)
            }
            style={[styles.item, { borderColor: theme.border }]}
          >
            <Text style={{ color: theme.text }}>{item.name}</Text>
            <Text style={{ color: theme.muted }}>
              {item.isDir ? strings.folder : `${item.size} ${strings.bytes}`}
            </Text>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 12 },
  item: { borderBottomWidth: 1, paddingVertical: 16, gap: 4, minHeight: 56 },
})
