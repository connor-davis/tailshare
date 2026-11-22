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
  leave(): Promise<void>
}

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
  /** Closes the room on this phone. */
  leave: () => native.leave(),
}
