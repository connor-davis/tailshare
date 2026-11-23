import { useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"

import type { RemoteEntry } from "../../modules/tailshare-core"
import { Button } from "../components/button"
import { formatSize } from "../lib/format"
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
  const [filter, setFilter] = useState("")
  // The filter only narrows the listing already on screen; it never asks the host.
  const shown = entries.filter((entry) =>
    entry.name.toLowerCase().includes(filter.trim().toLowerCase())
  )
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
      <TextInput
        accessibilityLabel={strings.searchFolder}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setFilter}
        placeholder={strings.searchFolder}
        placeholderTextColor={theme.muted}
        style={[
          styles.search,
          {
            borderColor: theme.input,
            backgroundColor: theme.field,
            color: theme.text,
          },
        ]}
        value={filter}
      />
      {loading ? (
        <ActivityIndicator
          color={theme.primary}
          accessibilityLabel={strings.loading}
        />
      ) : null}
      <FlatList
        data={shown}
        keyExtractor={(entry) => entry.name}
        ListEmptyComponent={
          loading ? undefined : (
            <Text style={{ color: theme.muted }}>
              {entries.length > 0 ? strings.noMatches : strings.empty}
            </Text>
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
              {item.isDir ? strings.folder : formatSize(item.size)}
            </Text>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  search: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 16,
    minHeight: 48,
  },
  body: { flex: 1, gap: 12 },
  item: { borderBottomWidth: 1, paddingVertical: 16, gap: 4, minHeight: 56 },
})
