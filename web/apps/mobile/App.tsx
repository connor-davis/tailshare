import * as DocumentPicker from "expo-document-picker"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  KeyboardAvoidingView,
  StatusBar,
  StyleSheet,
  useColorScheme,
} from "react-native"

import {
  core,
  type RemoteEntry,
  type RosterMember,
  type SavedRoom,
} from "./modules/tailshare-core"
import { HomeTopBar } from "./src/components/hero"
import { scanCode } from "./src/lib/scan-code"
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
  const scheme = useColorScheme()
  const [inRoom, setInRoom] = useState(false)
  const [tab, setTab] = useState<RoomTab>("files")
  const [code, setCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [room, setRoom] = useState<string | null>(null)
  // Preferences are synchronous, so load once without an extra effect-driven render.
  const [startupRooms] = useState(() => {
    try {
      return { rooms: core.listSavedRooms(), error: "" }
    } catch (failure) {
      return {
        rooms: [] as SavedRoom[],
        error: failure instanceof Error ? failure.message : String(failure),
      }
    }
  })
  const [savedRooms, setSavedRooms] = useState(startupRooms.rooms)
  const [path, setPath] = useState("")
  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(startupRooms.error)
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [roster, setRoster] = useState<RosterMember[]>([])
  // From the Go core after a join, held in memory only. Never log or store it.
  const [roomCode, setRoomCode] = useState("")

  const reloadRooms = useCallback(() => {
    try {
      setSavedRooms(core.listSavedRooms())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }, [])

  const rememberRoom = useCallback((name: string) => {
    try {
      core.saveRoom(name, "joined")
      setSavedRooms(core.listSavedRooms())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }, [])

  // Files shared from the share sheet while no room is open. The ref is what join reads, so a
  // share that lands mid-join is never missed; the state is only for the Home line.
  const [pendingShare, setPendingShare] = useState<string[]>([])
  const pendingRef = useRef<string[]>([])
  // True once transfers are on, so a share can go straight to the room.
  const readyRef = useRef(false)
  const pathRef = useRef("")
  useEffect(() => {
    pathRef.current = path
  }, [path])

  const setPending = useCallback((paths: string[]) => {
    pendingRef.current = paths
    setPendingShare(paths)
  }, [])

  const uploadAll = useCallback(async (paths: string[], dir: string) => {
    try {
      await Promise.all(paths.map((local) => core.upload(local, dir)))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }, [])

  // Back to Home, after Leave or when the host ends the room.
  const reset = useCallback(() => {
    readyRef.current = false
    setPending([])
    setInRoom(false)
    setTab("files")
    setError("")
    setRoom(null)
    setEntries([])
    setPath("")
    setCode("")
    setTransfers({})
    setMessages([])
    setRoster([])
    setRoomCode("")
  }, [setPending])

  // The share sheet: send now when a room is open, otherwise hold the files for the next join.
  useEffect(
    () =>
      core.onShareEvent((event) => {
        if (event.failed > 0) setError(strings.shareUnreadable)
        if (event.paths.length === 0) return
        if (readyRef.current) {
          void uploadAll(event.paths, pathRef.current)
        } else {
          setPending([...pendingRef.current, ...event.paths])
        }
      }),
    [setPending, uploadAll]
  )

  useEffect(
    () =>
      core.onOpenEvent(({ tab: destination }) => {
        setScanning(false)
        if (readyRef.current && destination !== "home") {
          setInRoom(true)
          setTab(destination)
        } else {
          setInRoom(false)
        }
      }),
    []
  )

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
        // Native cleanup also runs in the background, before this event reaches the screen.
        const wasOpen = readyRef.current
        reset()
        if (wasOpen) rememberRoom(room)
      }
    })
  }, [room, path, open, reset, rememberRoom])

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

  // The room event effect already resets on close, so a roster "closed" is ignored here.
  useEffect(() => {
    if (room === null) return
    return core.onRosterEvent((event) => {
      if (event.type === "roster") setRoster(event.members)
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
        multiple: true,
      })
      if (picked.canceled) return
      // The picker hands back file:// URIs in the app cache; Go wants plain paths.
      const locals = picked.assets.map((asset) =>
        decodeURIComponent(asset.uri.replace(/^file:\/\//, ""))
      )
      await uploadAll(locals, path)
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
      // Joining another room replaces the connection, so finish the old room's history first.
      if (room !== null) await leave()

      // A pasted tailshare:// link works too; anything else goes through as typed.
      await core.join(scanCode(roomCode) ?? roomCode, strings.phoneName)
      const joinedRoom = core.roomName()
      setRoom(joinedRoom)
      setRoomCode(core.roomCode())
      void core.requestNotifications().catch(() => {})
      await core.enableTransfers()
      await open("")
      if (!core.connected()) throw new Error(strings.roomEnded)

      readyRef.current = true
      setInRoom(true)
      setCode("")
      rememberRoom(joinedRoom)

      // Join opens the shared folder root, so held files go there.
      const held = pendingRef.current
      setPending([])
      if (held.length > 0) void uploadAll(held, "")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setJoining(false)
    }
  }

  const leave = async () => {
    await core.leave()
    const wasOpen = readyRef.current
    reset()
    if (room !== null && wasOpen) rememberRoom(room)
  }

  const forgetRoom = (name: string) => {
    try {
      core.forgetRoom(name)
      reloadRooms()
    } catch (failure) {
      fail(failure)
    }
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
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <StatusBar
        barStyle={scheme === "light" ? "dark-content" : "light-content"}
      />
      {room !== null && inRoom ? null : <HomeTopBar theme={theme} />}
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
          onDismissError={() => setError("")}
          onLeave={() => void leave().catch(fail)}
          onOpen={open}
          onDownload={download}
          onSend={send}
          messages={messages}
          onSendChat={sendChat}
          roster={roster}
          roomCode={roomCode}
          onCopy={core.copyText}
        />
      ) : (
        <HomeScreen
          theme={theme}
          room={room}
          savedRooms={savedRooms}
          onForgetRoom={forgetRoom}
          code={code}
          joining={joining}
          error={error}
          waitingFiles={pendingShare.length}
          seats={roster.length}
          onClearShare={() => setPending([])}
          onCodeChange={setCode}
          onJoin={() => void join()}
          onScan={() => setScanning(true)}
          onCancel={() => core.cancel()}
          onDismissError={() => setError("")}
          onOpenRoom={() => setInRoom(true)}
        />
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
})
