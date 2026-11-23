import { useRef, type ComponentRef } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"

import { Alert } from "../components/alert"
import { Button } from "../components/button"
import { Hero } from "../components/hero"
import { strings } from "../strings"
import type { Theme } from "../theme"

/** Home offers code entry or the one connected room supplied by the facade. */
export function HomeScreen(props: {
  theme: Theme
  room: string | null
  code: string
  joining: boolean
  error: string
  waitingFiles: number
  onClearShare: () => void
  onCodeChange: (code: string) => void
  onJoin: () => void
  onScan: () => void
  onCancel: () => void
  onDismissError: () => void
  onOpenRoom: () => void
}) {
  const { theme, room, code, joining, error } = props
  const input = useRef<ComponentRef<typeof TextInput>>(null)
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const cardTop = useRef(0)

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Hero
        theme={theme}
        showActions={room === null && !joining}
        onJoin={() => input.current?.focus()}
        onScan={props.onScan}
      />
      <View style={styles.gap} />
      {props.waitingFiles > 0 ? (
        <View
          style={[
            styles.card,
            styles.shareCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text accessibilityLiveRegion="polite" style={{ color: theme.text }}>
            {props.waitingFiles === 1
              ? strings.shareWaitingOne
              : `${props.waitingFiles} ${strings.shareWaiting}`}
          </Text>
          <Button
            theme={theme}
            label={strings.cancel}
            onPress={props.onClearShare}
            quiet
          />
        </View>
      ) : null}
      {room === null ? (
        <View
          onLayout={(event) => {
            cardTop.current = event.nativeEvent.layout.y
          }}
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text
            accessibilityRole="header"
            style={[styles.heading, { color: theme.text }]}
          >
            {strings.joinTitle}
          </Text>
          <Text style={[styles.label, { color: theme.text }]}>
            {strings.codeLabel}
          </Text>
          <TextInput
            ref={input}
            // Bring the card to the top so the keyboard never covers the box.
            onFocus={() =>
              scroll.current?.scrollTo({ y: cardTop.current, animated: true })
            }
            accessibilityLabel={strings.codeLabel}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!joining}
            onChangeText={props.onCodeChange}
            placeholder={strings.codePlaceholder}
            placeholderTextColor={theme.muted}
            style={[
              styles.input,
              {
                borderColor: theme.input,
                backgroundColor: theme.field,
                color: theme.text,
              },
            ]}
            value={code}
          />
          <Text style={{ color: theme.muted }}>{strings.codeHint}</Text>
          {joining ? (
            <View style={styles.waiting}>
              <ActivityIndicator
                color={theme.primary}
                accessibilityLabel={strings.loading}
              />
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.waitingText, { color: theme.muted }]}
              >
                {strings.waiting}
              </Text>
            </View>
          ) : null}
          <Button
            theme={theme}
            label={joining ? strings.cancel : strings.join}
            onPress={joining ? props.onCancel : props.onJoin}
            quiet={joining}
          />
          {error !== "" ? (
            <Alert
              theme={theme}
              message={error}
              onDismiss={props.onDismissError}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.rooms}>
          <Text
            accessibilityRole="header"
            style={[styles.heading, { color: theme.text }]}
          >
            {strings.rooms}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${strings.openRoom}: ${room}`}
            onPress={props.onOpenRoom}
            style={[
              styles.roomCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View
              style={[styles.roomHeader, { backgroundColor: theme.chrome }]}
            >
              <Text style={[styles.heading, { color: theme.chromeText }]}>
                {room}
              </Text>
            </View>
            <View style={styles.roomBody}>
              <Text style={{ color: theme.muted }}>{strings.connected}</Text>
              <Text style={[styles.open, { color: theme.link }]}>
                {strings.openRoom}
              </Text>
            </View>
          </Pressable>
          {error !== "" ? (
            <Alert
              theme={theme}
              message={error}
              onDismiss={props.onDismissError}
            />
          ) : null}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 8, padding: 16, gap: 16 },
  shareCard: { marginBottom: 16 },
  gap: { height: 16 },
  label: { fontSize: 14, fontWeight: "600" },
  heading: { fontSize: 20, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontSize: 20,
    letterSpacing: 2,
    minHeight: 48,
  },
  waiting: { flexDirection: "row", gap: 12, alignItems: "center" },
  waitingText: { flex: 1 },
  rooms: { gap: 16 },
  roomCard: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  roomHeader: { padding: 16 },
  roomBody: { padding: 16, gap: 16 },
  open: { fontWeight: "600" },
})
