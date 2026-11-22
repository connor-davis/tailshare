/** Where the one session is: nothing open, setting up, waiting, or live. */
export type SessionPhase = "idle" | "connecting" | "hosting" | "connected"

/** What the other computer said about itself. */
export interface PeerInfo {
  /** Name of the other computer. */
  displayName: string
  /** Base name of the folder the other computer shares. */
  sharedFolderName?: string
}

/** One person in the room. Names and an id only, never an address. */
export interface SessionMember {
  /** Stable id inside this room. */
  id: string
  /** Name of the computer. */
  displayName: string
  /** True for the computer that let everyone else in. */
  host?: boolean
  /** True for this computer. */
  you?: boolean
  /** Short code (12 hex characters) that tells two same-named computers apart. */
  fingerprint?: string
  /** Last sidecar observation of this member's mesh link; absent before the first probe. */
  path?:
    | { kind: "direct" }
    | { kind: "relay"; region?: string }
    | { kind: "unknown" }
}

/** The session as the sidecar reports it (`GET /api/session`). */
export interface SessionState {
  /** The room's canonical code, for every role. Missing when no room is open. */
  room?: string
  /** Current phase. */
  state: SessionPhase
  /** Which side this computer is, once a session is set up. */
  role?: "host" | "joiner"
  /** The share code. Present only while hosting. */
  code?: string
  /** The host's name for the room, shown to every member. */
  roomName?: string
  /** When the share code stops working. Gone once someone joins. */
  expiresAt?: string
  /** The other computer. Present only while connected. */
  peer?: PeerInfo
  /** One person waiting for local approval. */
  join?: { id: number; displayName: string; fingerprint?: string }
  /** Everyone in the room, host first. Present while hosting or connected. */
  members?: SessionMember[]
}

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
  /** Retries so far. Zero or missing for a first try. */
  attempt?: number
  /** When the next retry starts, as a time string. */
  retryAt?: string
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
  /** Uses the local folder-download route. */
  folder?: boolean
  /** Which way the file goes. */
  direction: "upload" | "download"
  /** Path on the sending side. */
  source: string
  /** Path on the receiving side. */
  destination: string
}

/** A file sent in chat. The path is inside the sender's room folder. */
export interface ChatAttachment {
  /** True when the attachment is a folder. */
  folder?: boolean
  /** Number of regular files in the folder. */
  count?: number
  /** Base name, for display and for saving. */
  name: string
  /** Path to ask the sender for. */
  path: string
  /** Size in bytes. */
  size: number
}

/** One chat message. */
export interface ChatMessage {
  /** Order the peer saw it. */
  seq: number
  /** Unique id, used to drop duplicates. */
  id: string
  /** True when the other computer wrote it. */
  fromPeer: boolean
  /** The words. Empty when the message is only a file. */
  text: string
  /** The file this message shares, if any. */
  attachment?: ChatAttachment
  /** When it was sent, as an ISO date string. */
  time: string
}

/** One app (a TCP port) a member shares with the room. */
export interface ForwardItem {
  /** Share id, chosen by the sharer. */
  id: string
  /** Name the sharer gave it. */
  label: string
  /** Port on the sharer's computer. */
  port: number
  /** Member id of the sharer. */
  ownerId: string
  /** Display name of the sharer. */
  ownerName: string
  /** True while this computer listens for it. */
  open: boolean
  /** Loopback port on this computer; set only while `open`. */
  localPort?: number
}

/** Every share in the room, from this computer's point of view. */
export interface ForwardState {
  /** Apps this computer shares. */
  mine: ForwardItem[]
  /** Apps other members share. */
  others: ForwardItem[]
  /** Names of members whose build cannot share apps. */
  unsupported: string[]
}

/** What the first live message carries. */
export interface Snapshot {
  /** Session state. */
  session: SessionState
  /** Every transfer, oldest first. */
  transfers: TransferItem[]
  /** Shared apps. Missing when the sidecar is older than apps. */
  forwards?: ForwardState
  /** Every open room, by code. Missing when the sidecar is older than rooms. */
  rooms?: SessionState[]
  /** Code of the room `session` describes. Empty when none is open. */
  active?: string
}

/** The one shape of every live message. */
export interface LiveEvent {
  /** Grows by one per event inside one sidecar run. */
  seq: number
  /** Which kind of event this is. */
  type: string
  /** The payload; its shape depends on `type`. */
  data: unknown
  /** Code of the room the event is about. Missing for events about the whole computer. */
  room?: string
}
