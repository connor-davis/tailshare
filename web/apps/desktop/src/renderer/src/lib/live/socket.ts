import type { QueryClient } from "@tanstack/react-query"
import type { ConnectionInfo } from "../../../../shared/bridge"
import type { LiveEvent } from "../api/types"
import { applyEvent } from "./apply"

/** The subprotocol name the sidecar requires before the token. */
const PROTOCOL = "tailshare.v1"

const FIRST_DELAY_MS = 500
const MAX_DELAY_MS = 10_000

/** Whether the socket is up. Shown as "Reconnecting…" in the session bar. */
export type LiveStatus = "open" | "reconnecting"

/** Extras a test can swap in; the app uses the defaults. */
export interface LiveSocketOptions {
  /** The WebSocket class to use. */
  socketClass?: typeof WebSocket
  /** Random number in [0, 1) for backoff jitter. */
  random?: () => number
  /** Called when the socket goes up or down. */
  onStatus?: (status: LiveStatus) => void
}

/**
 * The one live socket. It reconnects with a growing, capped delay. Each new
 * socket starts with a snapshot, so a missed event is repaired without polling.
 */
export class LiveSocket {
  /** Highest `seq` applied on the current socket. Resets on every new one. */
  lastSeq = 0

  private socket: WebSocket | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private stopped = true

  /** Prepare a socket. Call {@link LiveSocket.start} to open it. */
  constructor(
    private readonly info: ConnectionInfo,
    private readonly client: QueryClient,
    private readonly options: LiveSocketOptions = {}
  ) {}

  /** Open the socket. Does nothing if it is already running. */
  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.open()
  }

  /** Close the socket for good. No reconnect follows. */
  stop(): void {
    this.stopped = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.detach()
  }

  private open(): void {
    const Socket = this.options.socketClass ?? WebSocket
    const url = `${this.info.baseUrl.replace(/^http/, "ws")}/api/live`
    const socket = new Socket(url, [PROTOCOL, this.info.token])

    // seq is counted per sidecar run, so a new socket starts again at zero.
    this.lastSeq = 0
    this.socket = socket

    socket.onmessage = (message: MessageEvent) => {
      if (this.socket === socket) this.receive(String(message.data))
    }
    socket.onclose = () => {
      if (this.socket === socket) this.lost()
    }
    socket.onerror = () => {
      // A close always follows; reconnecting happens there.
    }
  }

  private receive(raw: string): void {
    let event: LiveEvent
    try {
      event = JSON.parse(raw) as LiveEvent
    } catch {
      return
    }

    if (event.type === "snapshot") {
      this.lastSeq = event.seq
      this.attempt = 0
      this.options.onStatus?.("open")
      applyEvent(this.client, event)

      return
    }

    // Old or repeated events are already in the snapshot.
    if (event.seq <= this.lastSeq) return

    // A gap means something was dropped. A fresh socket starts with a snapshot.
    if (event.seq !== this.lastSeq + 1) {
      this.socket?.close()

      return
    }

    this.lastSeq = event.seq
    applyEvent(this.client, event)
  }

  private lost(): void {
    this.detach()
    if (this.stopped) return
    this.options.onStatus?.("reconnecting")

    const base = Math.min(FIRST_DELAY_MS * 2 ** this.attempt, MAX_DELAY_MS)
    const jitter = (this.options.random ?? Math.random)() * base * 0.2
    this.attempt++

    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.stopped) this.open()
    }, base + jitter)
  }

  private detach(): void {
    const socket = this.socket
    this.socket = null
    if (!socket) return

    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    socket.close()
  }
}
