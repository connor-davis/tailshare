import { useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"

import { MAX_SEATS, type RosterMember } from "../../modules/tailshare-core"
import { Button } from "../components/button"
import { joinLink } from "../lib/scan-code"
import { strings } from "../strings"
import type { Theme } from "../theme"

/** Read-only roster: the invite block, then one grid of seats that is the roster. */
export function PeopleScreen(props: {
  theme: Theme
  roster: RosterMember[]
  roomCode: string
  onCopy: (text: string) => void
}) {
  const { theme, roster, roomCode } = props
  const [copied, setCopied] = useState(false)
  const shown =
    roomCode.length === 8
      ? `${roomCode.slice(0, 4)}-${roomCode.slice(4)}`
      : roomCode

  const copy = (text: string) => {
    props.onCopy(text)
    setCopied(true)
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={[styles.invite, { backgroundColor: theme.chrome }]}>
        <Text style={{ color: theme.chromeMuted }}>{strings.codeLabel}</Text>
        <Text style={[styles.code, { color: theme.chromeText }]}>{shown}</Text>
        <Button
          theme={theme}
          label={strings.copyCode}
          onPress={() => copy(shown)}
        />
        <Button
          theme={theme}
          label={strings.copyLink}
          quiet
          chrome
          onPress={() => copy(joinLink(roomCode))}
        />
        {copied ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: theme.chromeMuted }}
          >
            {strings.copied}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: theme.muted }}>
        {strings.seatsCount(roster.length, MAX_SEATS)}
      </Text>
      {Array.from({ length: MAX_SEATS }, (_, index) => {
        const member = roster[index]

        return member ? (
          <View
            key={member.fingerprint}
            style={[
              styles.seat,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={[styles.avatar, { borderColor: theme.border }]}>
              <Text style={[styles.name, { color: theme.text }]}>
                {Array.from(member.displayName)[0]?.toLocaleUpperCase()}
              </Text>
            </View>
            <View style={styles.seatText}>
              <Text style={[styles.name, { color: theme.text }]}>
                {member.displayName}
              </Text>
              <Text style={[styles.mono, { color: theme.muted }]}>
                {member.fingerprint}
              </Text>
              <View style={styles.chips}>
                {member.host ? (
                  <Text
                    style={[
                      styles.chip,
                      { color: theme.link, borderColor: theme.link },
                    ]}
                  >
                    {strings.hostChip}
                  </Text>
                ) : null}
                {member.you ? (
                  <Text
                    style={[
                      styles.chip,
                      { color: theme.text, borderColor: theme.input },
                    ]}
                  >
                    {strings.youChip}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : (
          <View
            key={`empty-${index}`}
            style={[
              styles.seat,
              { borderColor: theme.border, borderStyle: "dashed" },
            ]}
          >
            <View style={styles.seatText}>
              <Text style={[styles.name, { color: theme.text }]}>
                {strings.seatEmpty(index + 1)}
              </Text>
              <Text style={{ color: theme.muted }}>
                {strings.inviteWith(shown)}
              </Text>
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  list: { gap: 12, paddingBottom: 16 },
  invite: { borderRadius: 8, padding: 16, gap: 12 },
  code: { fontSize: 28, fontWeight: "700", fontFamily: "monospace" },
  seat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  seatText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: "700" },
  mono: { fontFamily: "monospace", fontSize: 12 },
  chips: { flexDirection: "row", gap: 6 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: "700",
  },
})
