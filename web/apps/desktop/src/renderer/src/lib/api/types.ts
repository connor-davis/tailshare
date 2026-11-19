/** Where the one session is: nothing open, setting up, waiting, or live. */
export type SessionPhase = "idle" | "connecting" | "hosting" | "connected"

/** What the other computer said about itself. */
export interface PeerInfo {
  /** Name of the other computer. */
  displayName: string
  /** Base name of the folder the other computer shares. */
  sharedFolderName: string
}

/** The session as the sidecar reports it (`GET /api/session`). */
export interface SessionState {
  /** Current phase. */
  state: SessionPhase
  /** Which side this computer is, once a session is set up. */
  role?: "host" | "joiner"
  /** The share code. Present only while hosting. */
  code?: string
  /** The other computer. Present only while connected. */
  peer?: PeerInfo
}

/** The folder this computer shares. */
export interface FolderInfo {
  /** Base name only. The full path never reaches the screen. */
  name: string
}

/** One row of a folder listing. */
export interface FileEntry {
  /** Name inside its folder. Display only. */
  name: string
  /** Size in bytes. */
  size: number
  /** Last change, as an ISO date string. */
  modTime: string
  /** True for a folder. */
  isDir: boolean
}

/** One page of a folder listing. */
export interface FilePage {
  /** Rows of this page. */
  entries: FileEntry[]
  /** Rows in the whole folder. */
  total: number
}

/** The two sides of the session. */
export type Side = "local" | "peer"

/** Every state a transfer can be in. */
export type TransferState =
  "queued" | "starting" | "running" | "paused" | "done" | "failed" | "canceled"

/** One transfer as the sidecar reports it. */
export interface TransferItem {
  /** Stable id. */
  id: string
  /** From this computer's point of view. */
  direction: "upload" | "download"
  /** Path of the sending side. */
  source: string
  /** Path of the receiving side. */
  destination: string
  /** Total bytes. */
  size: number
  /** Bytes moved so far. */
  bytes: number
  /** Where it is now. */
  state: TransferState
  /** Plain sentence, set when the transfer failed. */
  error?: string
}

/** A transfer plus the speed the renderer measured from progress events. */
export interface TransferView extends TransferItem {
  /** Smoothed bytes per second. Unset until two samples exist. */
  speed?: number
  /** When `bytes` was last seen, in epoch milliseconds. */
  sampledAt?: number
}

/** Body of `POST /api/transfers`. */
export interface TransferRequest {
  /** Which way the file goes. */
  direction: "upload" | "download"
  /** Path on the sending side. */
  source: string
  /** Path on the receiving side. */
  destination: string
}

/** One chat message. */
export interface ChatMessage {
  /** Order the peer saw it. */
  seq: number
  /** Unique id, used to drop duplicates. */
  id: string
  /** True when the other computer wrote it. */
  fromPeer: boolean
  /** The words. */
  text: string
  /** When it was sent, as an ISO date string. */
  time: string
}

/** What the first live message carries. */
export interface Snapshot {
  /** Session state. */
  session: SessionState
  /** The shared folder, or null when none was chosen. */
  folder: FolderInfo | null
  /** Every transfer, oldest first. */
  transfers: TransferItem[]
}

/** The one shape of every live message. */
export interface LiveEvent {
  /** Grows by one per event inside one sidecar run. */
  seq: number
  /** Which kind of event this is. */
  type: string
  /** The payload; its shape depends on `type`. */
  data: unknown
}
