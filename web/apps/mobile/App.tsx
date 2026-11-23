import * as DocumentPicker from "expo-document-picker"
import { useCallback, useEffect, useState } from "react"
import { StatusBar, StyleSheet, Text, View } from "react-native"

import { core, type RemoteEntry } from "./modules/tailshare-core"
import type { RoomTab } from "./src/components/tab-bar"
import type { ChatMessage } from "./src/screens/chat"
import { HomeScreen } from "./src/screens/home"
import { RoomScreen } from "./src/screens/room"
import { ScanScreen } from "./src/screens/scan"
import type { Transfer } from "./src/screens/transfers"
import { strings } from "./src/strings"
import { useTheme } from "./src/theme"

/** Owns the single native connection, pushed events and local phone navigation. */
export default function App() {
  const theme = useTheme()
  const [inRoom, setInRoom] = useState(false)
  const [tab, setTab] = useState<RoomTab>("files")
  const [code, setCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [room, setRoom] = useState<string | null>(null)
  const [path, setPath] = useState("")
  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // Back to an empty Home, after Leave or when the host ends the room.
  const reset = useCallback(() => {
    setInRoom(false)
    setTab("files")
    setError("")
    setRoom(null)
    setEntries([])
    setPath("")
    setCode("")
    setTransfers({})
    setMessages([])
  }, [])

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

  // Pushed by the host: list the current folder again, or go back when the room ends.
  useEffect(() => {
    if (room === null) return
    return core.onRoomEvent((event) => {
      if (event.type === "files.changed") {
        void open(path)
      } else {
        // The room is over: release this phone's side too.
        core.leave().catch(() => {})
        reset()
      }
    })
  }, [room, path, open, reset])

  // Progress from the Go core, pushed as it happens.
  useEffect(() => {
    if (room === null) return
    return core.onTransferEvent((event) => {
      if (event.type === "transfer") {
        setTransfers((current) => ({ ...current, [event.id]: event }))
      }
    })
  }, [room])

  // History replays after a re-subscribe, so a known id is skipped. Same 200 cap as the Go side.
  useEffect(() => {
    if (room === null) return
    return core.onChatEvent((event) => {
      if (event.type !== "chat") return
      setMessages((current) =>
        current.some((message) => message.id === event.id)
          ? current
          : [...current, event].slice(-200)
      )
    })
  }, [room])

  const fail = (failure: unknown) =>
    setError(failure instanceof Error ? failure.message : String(failure))

  const download = (entry: RemoteEntry) =>
    core
      .download(path === "" ? entry.name : `${path}/${entry.name}`)
      .catch(fail)

  const sendChat = (text: string) =>
    core.sendChat(text).then(
      () => {
        setError("")
        return true
      },
      (failure: unknown) => {
        fail(failure)
        return false
      }
    )

  const send = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      })
      if (picked.canceled) return
      // The picker hands back a file:// URI in the app cache; Go wants the plain path.
      const local = decodeURIComponent(
        picked.assets[0].uri.replace(/^file:\/\//, "")
      )
      await core.upload(local, path)
    } catch (failure) {
      fail(failure)
    }
  }

  const join = async (roomCode = code) => {
    if (roomCode.trim() === "") {
      setError(strings.noCode)
      return
    }
    setError("")
    setJoining(true)
    try {
      await core.join(roomCode, strings.phoneName)
      setRoom(core.roomName())
      await core.enableTransfers()
      await open("")
      setInRoom(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setJoining(false)
    }
  }

  const leave = async () => {
    await core.leave()
    reset()
  }

  if (scanning) {
    return (
      <ScanScreen
        theme={theme}
        onBack={() => setScanning(false)}
        onScan={(scannedCode) => {
          setScanning(false)
          setCode(scannedCode)
          void join(scannedCode)
        }}
      />
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" />
      <View
        style={[
          styles.hero,
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
          {strings.title}
        </Text>
      </View>
      {room !== null && inRoom ? (
        <RoomScreen
          theme={theme}
          room={room}
          tab={tab}
          path={path}
          entries={entries}
          loading={loading}
          error={error}
          transfers={Object.values(transfers)}
          onTab={setTab}
          onHome={() => setInRoom(false)}
          onLeave={() => void leave().catch(fail)}
          onOpen={open}
          onDownload={download}
          onSend={send}
          messages={messages}
          onSendChat={sendChat}
        />
      ) : (
        <HomeScreen
          theme={theme}
          room={room}
          code={code}
          joining={joining}
          error={error}
          onCodeChange={setCode}
          onJoin={() => void join()}
          onScan={() => setScanning(true)}
          onCancel={() => core.cancel()}
          onOpenRoom={() => setInRoom(true)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hero: { paddingHorizontal: 16, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: "700" },
})
