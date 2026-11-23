import { requireNativeModule } from "expo"

/** One file or folder in the host's shared folder. */
export type RemoteEntry = {
  name: string
  size: number
  modTime: string
  isDir: boolean
}

/** One page of a host folder, as the Go core sends it. */
export type RemoteList = { entries: RemoteEntry[]; total: number }

type Native = {
  join(code: string, name: string): Promise<void>
  cancel(): void
  roomName(): string
  connected(): boolean
  listRemote(dir: string): Promise<string>
  enableTransfers(): Promise<void>
  download(remote: string): Promise<string>
  upload(localPath: string, remoteDir: string): Promise<string>
  leave(): Promise<void>
  sendChat(text: string): Promise<void>
  watchChat(): void
  watchShare(): void
  watchOpen(): void
  requestNotifications(): Promise<unknown>
  addListener(
    event: "onRoomEvent" | "onTransferEvent" | "onChatEvent",
    listener: (event: { json: string }) => void
  ): { remove(): void }
  addListener(
    event: "onOpenEvent",
    listener: (event: OpenEvent) => void
  ): { remove(): void }
  addListener(
    event: "onShareEvent",
    listener: (event: ShareEvent) => void
  ): { remove(): void }
}

/** Files shared to Tailshare from the Android share sheet, already copied into the app cache. `failed` counts files that could not be read. */
export type ShareEvent = { type: "share"; paths: string[]; failed: number }

/** A notification destination; a room tab is used only while connected. */
export type OpenEvent = { tab: "chat" | "transfers" | "home" }

/** Something the host did that the screen should show. */
export type RoomEvent = { type: "files.changed" } | { type: "closed" }

/** Progress of one file moving. `saved` is the final name in Downloads, set when a download is done. */
export type TransferEvent =
  | {
      type: "transfer"
      id: string
      name: string
      direction: "upload" | "download"
      state:
        | "queued"
        | "starting"
        | "running"
        | "paused"
        | "failed"
        | "done"
        | "canceled"
      done: number
      size: number
      reason: string
      saved?: string
    }
  | { type: "closed" }

/** One chat line. History replays after a re-subscribe, so dedupe by `id`. `fileName` is set for a file message. */
export type ChatEvent =
  | {
      type: "chat"
      id: string
      from: string
      fromName: string
      text: string
      sentAt: string
      mine: boolean
      history: boolean
      fileName?: string
    }
  | { type: "closed" }

const native = requireNativeModule<Native>("TailshareCore")

/** The Go core: join by code, then list the host's shared folder. */
export const core = {
  /** Connects and waits for the host to approve on the desktop. */
  join: (code: string, name: string) => native.join(code, name),
  /** Stops a join that is still waiting. */
  cancel: () => native.cancel(),
  /** The host's name for the room. */
  roomName: () => native.roomName(),
  /** False once the host closes the room. */
  connected: () => native.connected(),
  /** Lists one host folder; an empty path is the shared folder. */
  async list(dir: string): Promise<RemoteList> {
    return JSON.parse(await native.listRemote(dir)) as RemoteList
  },
  /** Calls handler for each host event; the returned function unsubscribes. */
  onRoomEvent(handler: (event: RoomEvent) => void): () => void {
    const subscription = native.addListener("onRoomEvent", ({ json }) => {
      try {
        handler(JSON.parse(json) as RoomEvent)
      } catch {
        // A malformed event is ignored; the next one still arrives.
      }
    })

    return () => subscription.remove()
  },
  /** Turns on file transfers; call once after join. */
  enableTransfers: () => native.enableTransfers(),
  /** Queues one host file (a path inside the shared folder); returns the transfer id. */
  download: (remote: string) => native.download(remote),
  /** Queues a phone file (an absolute path under the app cache) for a host folder. */
  upload: (localPath: string, remoteDir: string) =>
    native.upload(localPath, remoteDir),
  /** Calls handler for each transfer update; the returned function unsubscribes. */
  onTransferEvent(handler: (event: TransferEvent) => void): () => void {
    const subscription = native.addListener("onTransferEvent", ({ json }) => {
      try {
        handler(JSON.parse(json) as TransferEvent)
      } catch {
        // A malformed event is ignored; the next one still arrives.
      }
    })

    return () => subscription.remove()
  },
  /** Sends one text message to the host; rejects with a plain sentence. */
  sendChat: (text: string) => native.sendChat(text),
  /** Calls handler for each chat message, history first; the returned function unsubscribes. */
  onChatEvent(handler: (event: ChatEvent) => void): () => void {
    const subscription = native.addListener("onChatEvent", ({ json }) => {
      try {
        handler(JSON.parse(json) as ChatEvent)
      } catch {
        // A malformed event is ignored; the next one still arrives.
      }
    })
    // Listen first, then start the pump, so the history replay reaches this handler.
    native.watchChat()

    return () => subscription.remove()
  },
  /** Calls handler for each share-sheet share, including one that arrived before this call; the returned function unsubscribes. */
  onShareEvent(handler: (event: ShareEvent) => void): () => void {
    const subscription = native.addListener("onShareEvent", handler)
    // Listen first, then flush, so a cold-start share reaches this handler.
    native.watchShare()

    return () => subscription.remove()
  },
  /** Asks once for Android notification permission after a successful join. */
  requestNotifications: () => native.requestNotifications(),
  /** Delivers notification taps, including a tap that launched the app. */
  onOpenEvent(handler: (event: OpenEvent) => void): () => void {
    const subscription = native.addListener("onOpenEvent", handler)
    native.watchOpen()

    return () => subscription.remove()
  },
  /** Closes the room on this phone. */
  leave: () => native.leave(),
}
