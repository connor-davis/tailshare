import { Pressable, StyleSheet, Text, View } from "react-native"

import type { RemoteEntry } from "../../modules/tailshare-core"
import { Alert } from "../components/alert"
import { GlyphButton, TopBar } from "../components/hero"
import { TabBar, type RoomTab } from "../components/tab-bar"
import { useKeyboardOpen } from "../lib/use-keyboard"
import { strings } from "../strings"
import type { Theme } from "../theme"
import { ChatScreen, type ChatMessage } from "./chat"
import { FilesScreen } from "./files"
import { countTransfers, TransfersScreen, type Transfer } from "./transfers"

/** A connected room with five local-state tabs and an explicit way back Home. */
export function RoomScreen(props: {
  theme: Theme
  room: string
  tab: RoomTab
  path: string
  entries: RemoteEntry[]
  loading: boolean
  error: string
  transfers: Transfer[]
  onTab: (tab: RoomTab) => void
  onHome: () => void
  onDismissError: () => void
  onLeave: () => void
  onOpen: (path: string) => void
  onDownload: (entry: RemoteEntry) => void
  onSend: () => void
  messages: ChatMessage[]
  onSendChat: (text: string) => Promise<boolean>
}) {
  const { theme, room, tab } = props
  const keyboardOpen = useKeyboardOpen()
  const activeTransfers = countTransfers(props.transfers).active

  return (
    <View style={styles.screen}>
      <TopBar theme={theme}>
        <GlyphButton
          theme={theme}
          glyph="←"
          label={strings.backHome}
          onPress={props.onHome}
        />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, { color: theme.text }]}
        >
          {room}
        </Text>
        <View style={[styles.pill, { borderColor: theme.link }]}>
          <Text style={[styles.pillText, { color: theme.link }]}>
            {strings.connected}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.leave}
          onPress={props.onLeave}
          style={styles.leave}
        >
          <Text style={[styles.leaveText, { color: theme.error }]}>
            {strings.leave}
          </Text>
        </Pressable>
      </TopBar>
      <View style={styles.body}>
        <Text
          accessibilityRole="header"
          style={[styles.heading, { color: theme.text }]}
        >
          {strings[tab]}
        </Text>
        {props.error !== "" ? (
          <Alert
            theme={theme}
            message={props.error}
            onDismiss={props.onDismissError}
          />
        ) : null}
        {tab === "files" ? (
          <FilesScreen
            key={props.path}
            theme={theme}
            path={props.path}
            entries={props.entries}
            loading={props.loading}
            onOpen={props.onOpen}
            onDownload={props.onDownload}
            onSend={props.onSend}
          />
        ) : tab === "transfers" ? (
          <TransfersScreen theme={theme} transfers={props.transfers} />
        ) : tab === "chat" ? (
          <ChatScreen
            theme={theme}
            messages={props.messages}
            onSend={props.onSendChat}
          />
        ) : (
          <Text style={{ color: theme.muted }}>{strings.desktopOnly}</Text>
        )}
      </View>
      {keyboardOpen ? null : (
        <TabBar
          theme={theme}
          active={tab}
          onSelect={props.onTab}
          transferCount={activeTransfers}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: { flex: 1, fontSize: 17, fontWeight: "700" },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  pillText: { fontSize: 12, fontWeight: "700" },
  leave: { minHeight: 48, justifyContent: "center", paddingHorizontal: 4 },
  leaveText: { fontSize: 14, fontWeight: "700" },
  body: { flex: 1, padding: 16, gap: 16 },
  heading: { fontSize: 20, fontWeight: "600" },
})
