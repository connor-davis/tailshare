import { StyleSheet, Text, View } from "react-native"

import type { RemoteEntry } from "../../modules/tailshare-core"
import { Button } from "../components/button"
import { TabBar, type RoomTab } from "../components/tab-bar"
import { strings } from "../strings"
import type { Theme } from "../theme"
import { ChatScreen, type ChatMessage } from "./chat"
import { FilesScreen } from "./files"
import { TransfersScreen, type Transfer } from "./transfers"

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
  onLeave: () => void
  onOpen: (path: string) => void
  onDownload: (entry: RemoteEntry) => void
  onSend: () => void
  messages: ChatMessage[]
  onSendChat: (text: string) => Promise<boolean>
}) {
  const { theme, room, tab } = props

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { backgroundColor: theme.chrome }]}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.chromeText }]}
        >
          {room}
        </Text>
        <Text style={{ color: theme.chromeMuted }}>{strings.connected}</Text>
        <View style={styles.actions}>
          <Button
            theme={theme}
            label={strings.home}
            onPress={props.onHome}
            quiet
            chrome
          />
          <Button
            theme={theme}
            label={strings.leave}
            onPress={props.onLeave}
            quiet
            chrome
          />
        </View>
      </View>
      <View style={styles.body}>
        <Text
          accessibilityRole="header"
          style={[styles.heading, { color: theme.text }]}
        >
          {strings[tab]}
        </Text>
        {props.error !== "" ? (
          <Text accessibilityRole="alert" style={{ color: theme.error }}>
            {props.error}
          </Text>
        ) : null}
        {tab === "files" ? (
          <FilesScreen
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
      <TabBar theme={theme} active={tab} onSelect={props.onTab} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { padding: 16, paddingTop: 0, gap: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
  body: { flex: 1, padding: 16, gap: 16 },
  heading: { fontSize: 20, fontWeight: "600" },
})
