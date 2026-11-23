import { CameraView, useCameraPermissions } from "expo-camera"
import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  BackHandler,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { Button } from "../components/button"
import { scanCode } from "../lib/scan-code"
import { strings } from "../strings"
import type { Theme } from "../theme"

/** Scans one valid room code and releases the camera when navigation closes it. */
export function ScanScreen(props: {
  theme: Theme
  onBack: () => void
  onScan: (code: string) => void
}) {
  const { theme, onBack, onScan } = props
  const [permission, requestPermission] = useCameraPermissions()
  const [invalid, setInvalid] = useState(false)
  const [cameraFailed, setCameraFailed] = useState(false)
  const consumed = useRef(false)

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onBack()
        return true
      }
    )

    return () => subscription.remove()
  }, [onBack])

  const read = ({ data }: { data: string }) => {
    if (consumed.current) return

    const code = scanCode(data)
    if (code === null) {
      setInvalid(true)
      return
    }

    // A camera can deliver several results before React unmounts this screen.
    consumed.current = true
    onScan(code)
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.chrome,
            paddingTop: (StatusBar.currentHeight ?? 0) + 16,
          },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.chromeText }]}
        >
          {strings.scanQr}
        </Text>
        <Button
          theme={theme}
          label={strings.back}
          onPress={onBack}
          quiet
          chrome
        />
      </View>
      {!permission ? (
        <View style={styles.message}>
          <ActivityIndicator
            color={theme.primary}
            accessibilityLabel={strings.loading}
          />
        </View>
      ) : cameraFailed ? (
        <View style={styles.message}>
          <Text accessibilityRole="alert" style={{ color: theme.error }}>
            {strings.cameraUnavailable}
          </Text>
        </View>
      ) : !permission.granted ? (
        <View style={styles.message}>
          <Text style={{ color: theme.text }}>
            {permission.status === "denied"
              ? strings.cameraDenied
              : strings.cameraPermission}
          </Text>
          {permission.status !== "denied" && permission.canAskAgain ? (
            <Button
              theme={theme}
              label={strings.allowCamera}
              onPress={() =>
                void requestPermission().catch(() => setCameraFailed(true))
              }
            />
          ) : null}
        </View>
      ) : (
        <>
          <CameraView
            style={styles.camera}
            facing="back"
            accessibilityLabel={strings.scannerLabel}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={read}
            onMountError={() => setCameraFailed(true)}
          />
          <View
            style={[styles.instructions, { backgroundColor: theme.surface }]}
          >
            <Text style={{ color: theme.text }}>{strings.scanHint}</Text>
            {invalid ? (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={{ color: theme.error }}
              >
                {strings.invalidQr}
              </Text>
            ) : null}
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  title: { fontSize: 20, fontWeight: "600" },
  message: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  camera: { flex: 1 },
  instructions: { padding: 24, paddingBottom: 48, gap: 16 },
})
