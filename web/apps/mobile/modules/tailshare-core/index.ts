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
  addListener(
    event: "onRoomEvent" | "onTransferEvent",
    listener: (event: { json: string }) => void
  ): { remove(): void }
}

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
  /** Closes the room on this phone. */
  leave: () => native.leave(),
}
