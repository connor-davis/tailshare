import { useCallback, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"

import { core, type RemoteEntry } from "./modules/tailshare-core"
import { strings } from "./src/strings"
import { useTheme } from "./src/theme"

type Theme = ReturnType<typeof useTheme>

function Button(props: {
  theme: Theme
  label: string
  onPress: () => void
  quiet?: boolean
}) {
  const { theme, label, onPress, quiet } = props

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.button,
        quiet
          ? { borderColor: theme.border, borderWidth: 1 }
          : { backgroundColor: theme.primary },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: quiet ? theme.text : theme.onPrimary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** The phone app: join a desktop room by code, then browse its files. */
export default function App() {
  const theme = useTheme()
  const [code, setCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [room, setRoom] = useState<string | null>(null)
  const [path, setPath] = useState("")
  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const open = useCallback(async (dir: string) => {
    setLoading(true)
    setError("")
    try {
      const result = await core.list(dir)
      setEntries(result.entries)
      setPath(dir)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setLoading(false)
    }
  }, [])

  const join = async () => {
    if (code.trim() === "") {
      setError(strings.noCode)
      return
    }
    setError("")
    setJoining(true)
    try {
      await core.join(code, strings.phoneName)
      setRoom(core.roomName())
      await open("")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setJoining(false)
    }
  }

  const leave = async () => {
    await core.leave()
    setRoom(null)
    setEntries([])
    setPath("")
    setCode("")
  }

  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""

  return (
    // Android 15 draws apps edge to edge, so keep clear of the status bar.
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.background,
          paddingTop: (StatusBar.currentHeight ?? 0) + 16,
        },
      ]}
    >
      <StatusBar barStyle={theme.statusBar} />
      <Text style={[styles.title, { color: theme.heading }]}>
        {strings.title}
      </Text>

      {room === null ? (
        <View style={styles.body}>
          <Text style={{ color: theme.muted }}>{strings.codeHint}</Text>
          <TextInput
            accessibilityLabel={strings.codeLabel}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!joining}
            onChangeText={setCode}
            placeholder="7K3Q-9PXM"
            placeholderTextColor={theme.muted}
            style={[
              styles.input,
              {
                borderColor: theme.border,
                backgroundColor: theme.surface,
                color: theme.text,
              },
            ]}
            value={code}
          />
          {joining ? (
            <View style={styles.row}>
              <ActivityIndicator color={theme.primary} />
              <Text style={{ color: theme.text }}>{strings.waiting}</Text>
            </View>
          ) : null}
          {joining ? (
            <Button
              theme={theme}
              label={strings.cancel}
              onPress={() => core.cancel()}
              quiet
            />
          ) : (
            <Button theme={theme} label={strings.join} onPress={join} />
          )}
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={[styles.heading, { color: theme.text }]}>{room}</Text>
          <Text style={{ color: theme.muted }}>/{path}</Text>
          {path !== "" ? (
            <Button
              theme={theme}
              label={strings.up}
              onPress={() => open(parent)}
              quiet
            />
          ) : null}
          {loading ? <ActivityIndicator color={theme.primary} /> : null}
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
                disabled={!item.isDir}
                onPress={() =>
                  open(path === "" ? item.name : `${path}/${item.name}`)
                }
                style={[styles.item, { borderColor: theme.border }]}
              >
                <Text style={{ color: theme.text }}>{item.name}</Text>
                <Text style={{ color: theme.muted }}>
                  {item.isDir
                    ? strings.folder
                    : `${item.size} ${strings.bytes}`}
                </Text>
              </Pressable>
            )}
          />
          <Button theme={theme} label={strings.leave} onPress={leave} quiet />
        </View>
      )}

      {error !== "" ? (
        <Text style={[styles.error, { color: theme.error }]}>{error}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 16 },
  body: { flex: 1, gap: 12 },
  heading: { fontSize: 20, fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 20,
    letterSpacing: 2,
  },
  button: { borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { fontSize: 16, fontWeight: "600" },
  item: { borderBottomWidth: 1, paddingVertical: 12, gap: 2 },
  error: { marginTop: 8 },
})
