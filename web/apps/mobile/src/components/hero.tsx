import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native"

import { strings } from "../strings"
import type { Theme } from "../theme"
import { Button } from "./button"

const stripes = Array.from({ length: 16 }, (_, index) => index)

/** The orange and black hazard stripe from the Spaces mock. */
export function HazardStripe(props: { theme: Theme }) {
  return (
    <View style={styles.stripe} importantForAccessibility="no-hide-descendants">
      {stripes.map((index) => (
        <View
          key={index}
          style={[
            styles.stripeBar,
            {
              backgroundColor:
                index % 2 === 0 ? props.theme.primary : "transparent",
            },
          ]}
        />
      ))}
    </View>
  )
}

/** Top bar of a screen: status-bar gap, then a 48 high row the caller fills. */
export function TopBar(props: {
  theme: Theme
  children: React.ReactNode
  style?: ViewStyle
}) {
  const { theme } = props

  return (
    <View
      style={[
        styles.top,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          paddingTop: StatusBar.currentHeight ?? 0,
        },
      ]}
    >
      <View style={[styles.topRow, props.style]}>{props.children}</View>
    </View>
  )
}

/** Home top bar: logo chip, app name and the phone's name chip. No dead buttons. */
export function HomeTopBar(props: { theme: Theme }) {
  const { theme } = props

  return (
    <TopBar theme={theme}>
      <View style={[styles.logo, { backgroundColor: theme.chrome }]}>
        <Text style={[styles.logoGlyph, { color: theme.primary }]}>⇄</Text>
      </View>
      <Text
        accessibilityRole="header"
        style={[styles.appName, { color: theme.text }]}
      >
        {strings.title}
      </Text>
      <View style={styles.grow} />
      <View style={[styles.chip, { backgroundColor: theme.field }]}>
        <Text style={[styles.chipText, { color: theme.muted }]}>
          {strings.phoneName}
        </Text>
      </View>
    </TopBar>
  )
}

/** Hero card: stripe, headline, one line of copy and the join actions. */
export function Hero(props: {
  theme: Theme
  showActions: boolean
  onJoin: () => void
  onScan: () => void
}) {
  const { theme } = props

  return (
    <View style={[styles.hero, { backgroundColor: theme.chrome }]}>
      <HazardStripe theme={theme} />
      <View style={styles.heroBody}>
        <Text
          accessibilityRole="header"
          style={[styles.heroTitle, { color: theme.chromeText }]}
        >
          {strings.heroTitle}
        </Text>
        <Text style={{ color: theme.chromeMuted }}>{strings.heroCopy}</Text>
        {props.showActions ? (
          <View style={styles.actions}>
            <Button
              theme={theme}
              label={strings.joinWithCode}
              onPress={props.onJoin}
            />
            <Button
              theme={theme}
              label={strings.scanQr}
              onPress={props.onScan}
              quiet
              chrome
            />
          </View>
        ) : null}
      </View>
    </View>
  )
}

/** Round icon-style button made of one glyph, with a real label for screen readers. */
export function GlyphButton(props: {
  theme: Theme
  glyph: string
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={styles.glyphButton}
    >
      <Text style={[styles.glyph, { color: props.theme.text }]}>
        {props.glyph}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stripe: { flexDirection: "row", height: 8, overflow: "hidden" },
  stripeBar: { flex: 1, transform: [{ skewX: "-45deg" }] },
  top: { borderBottomWidth: 1 },
  topRow: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  logo: {
    width: 26,
    height: 26,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  logoGlyph: { fontSize: 16, fontWeight: "700" },
  appName: { fontSize: 15, fontWeight: "700" },
  grow: { flex: 1 },
  chip: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 12, fontWeight: "600" },
  hero: { borderRadius: 8, overflow: "hidden" },
  heroBody: { padding: 18, gap: 8 },
  heroTitle: { fontSize: 22, lineHeight: 26, fontWeight: "700" },
  actions: { gap: 12, marginTop: 8 },
  glyphButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { fontSize: 22 },
})
