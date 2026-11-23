import { useState } from "react"
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native"

import type { ChatEvent } from "../../modules/tailshare-core"
import { Button } from "../components/button"
import { strings } from "../strings"
import type { Theme } from "../theme"

/** One chat line pushed by the Go core. */
export type ChatMessage = Extract<ChatEvent, { type: "chat" }>

function clock(sentAt: string): string {
  return new Date(sentAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Room messages, newest at the bottom, and a box to write one. Text only. */
export function ChatScreen(props: {
  theme: Theme
  messages: ChatMessage[]
  /** Resolves true when the host took the message, so the box can clear. */
  onSend: (text: string) => Promise<boolean>
}) {
  const { theme, messages } = props
  const [draft, setDraft] = useState("")

  const submit = async () => {
    if (draft.trim() === "") return
    if (await props.onSend(draft)) setDraft("")
  }

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.list}
        accessibilityLabel={strings.messages}
        data={messages}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={{ color: theme.muted }}>{strings.noMessages}</Text>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.message,
              {
                backgroundColor: item.mine ? theme.secondary : theme.surface,
                borderColor: theme.border,
                alignSelf: item.mine ? "flex-end" : "flex-start",
              },
            ]}
          >
            <Text style={[styles.meta, { color: theme.muted }]}>
              {item.mine ? strings.you : item.fromName} · {clock(item.sentAt)}
            </Text>
            {item.text !== "" ? (
              <Text style={{ color: theme.text }}>{item.text}</Text>
            ) : null}
            {item.fileName ? (
              <Text style={{ color: theme.link }}>{item.fileName}</Text>
            ) : null}
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel={strings.messageLabel}
          placeholder={strings.messagePlaceholder}
          placeholderTextColor={theme.muted}
          value={draft}
          onChangeText={setDraft}
          multiline
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.field,
              borderColor: theme.input,
            },
          ]}
        />
        <Button
          theme={theme}
          label={strings.sendMessage}
          onPress={() => void submit()}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12 },
  list: { flex: 1 },
  message: {
    maxWidth: "85%",
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  meta: { fontSize: 12 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontSize: 16,
  },
})
