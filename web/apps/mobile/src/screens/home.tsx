import { useEffect, useRef, useState, type ComponentRef } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"

import type { SavedRoom } from "../../modules/tailshare-core"
import { Alert } from "../components/alert"
import { Button } from "../components/button"
import { Hero } from "../components/hero"
import { strings } from "../strings"
import type { Theme } from "../theme"

/** Home offers code entry and remembered rooms with their current connection status. */
export function HomeScreen(props: {
  theme: Theme
  room: string | null
  savedRooms: SavedRoom[]
  onForgetRoom: (name: string) => void
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
  const searchTop = useRef(0)
  const [search, setSearch] = useState("")
  const [showJoin, setShowJoin] = useState(false)
  const rooms = props.savedRooms.filter((saved) =>
    saved.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  )

  const focusJoin = () => {
    setShowJoin(true)
    input.current?.focus()
  }

  // A connected Home normally hides code entry; focus after Rejoin makes it visible.
  useEffect(() => {
    if (showJoin) input.current?.focus()
  }, [showJoin])

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Hero
        theme={theme}
        showActions={room === null && !joining}
        onJoin={focusJoin}
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
      {room === null || showJoin ? (
        <View
          onLayout={(event) => {
            cardTop.current = event.nativeEvent.layout.y
            if (input.current?.isFocused()) {
              scroll.current?.scrollTo({ y: cardTop.current, animated: true })
            }
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
        </View>
      ) : null}
      {error !== "" ? (
        <Alert theme={theme} message={error} onDismiss={props.onDismissError} />
      ) : null}
      <View
        onLayout={(event) => {
          searchTop.current = event.nativeEvent.layout.y
        }}
        style={[styles.rooms, styles.roomSection]}
      >
        <Text
          accessibilityRole="header"
          style={[styles.heading, { color: theme.text }]}
        >
          {strings.rooms}
        </Text>
        {props.savedRooms.length > 0 ? (
          <View>
            <TextInput
              accessibilityLabel={strings.searchRooms}
              placeholder={strings.searchRooms}
              placeholderTextColor={theme.muted}
              autoCorrect={false}
              value={search}
              onChangeText={setSearch}
              onFocus={() =>
                scroll.current?.scrollTo({
                  y: searchTop.current,
                  animated: true,
                })
              }
              style={[
                styles.search,
                {
                  color: theme.text,
                  backgroundColor: theme.field,
                  borderColor: theme.input,
                },
              ]}
            />
          </View>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.heading, { color: theme.text }]}>
              {strings.noRooms}
            </Text>
            <Text style={{ color: theme.muted }}>{strings.noRoomsHint}</Text>
            <Button theme={theme} label={strings.join} onPress={focusJoin} />
            <Button
              theme={theme}
              label={strings.scanQr}
              onPress={props.onScan}
              quiet
            />
          </View>
        )}
        {props.savedRooms.length > 0 && rooms.length === 0 ? (
          <Text style={{ color: theme.muted }}>{strings.noRoomMatches}</Text>
        ) : null}
        {rooms.map((saved) => {
          const live = saved.name === room

          return (
            <View
              key={saved.name}
              style={[
                styles.roomCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View
                style={[styles.roomHeader, { backgroundColor: theme.chrome }]}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.letterTile,
                    { borderColor: theme.chromeMuted },
                  ]}
                >
                  <Text style={[styles.heading, { color: theme.chromeText }]}>
                    {Array.from(saved.name)[0]?.toLocaleUpperCase()}
                  </Text>
                </View>
                <View style={styles.roomName}>
                  <Text style={[styles.heading, { color: theme.chromeText }]}>
                    {saved.name}
                  </Text>
                  <Text style={{ color: theme.chromeMuted }}>
                    {saved.role === "host"
                      ? strings.roomHost
                      : strings.roomJoined}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.pill,
                    {
                      color: live ? theme.primary : theme.chromeText,
                      borderColor: theme.chromeMuted,
                    },
                  ]}
                >
                  {live ? strings.roomLive : strings.roomClosed}
                </Text>
              </View>
              <View style={styles.roomBody}>
                {live ? (
                  <Button
                    theme={theme}
                    label={strings.openRoom}
                    onPress={props.onOpenRoom}
                  />
                ) : (
                  <>
                    <Text style={{ color: theme.muted }}>
                      {strings.lastOpen(
                        new Date(saved.lastOpen).toLocaleString()
                      )}
                    </Text>
                    <Button
                      theme={theme}
                      label={strings.rejoin}
                      onPress={() => {
                        props.onCodeChange("")
                        focusJoin()
                      }}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={strings.forgetRoom(saved.name)}
                      onPress={() => props.onForgetRoom(saved.name)}
                      style={styles.forget}
                    >
                      <Text style={{ color: theme.link }}>
                        {strings.forget}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          )
        })}
      </View>
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
  roomHeader: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  roomSection: { marginTop: 24 },
  roomName: { flex: 1, minWidth: 100, gap: 4 },
  letterTile: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  search: {
    minHeight: 48,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 16,
  },
  forget: {
    minHeight: 48,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  roomBody: { padding: 16, gap: 16 },
})
