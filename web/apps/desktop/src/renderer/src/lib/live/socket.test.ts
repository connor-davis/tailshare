import { QueryClient } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { keys } from "../api/keys"
import { LiveSocket } from "./socket"

class FakeSocket {
  static all: FakeSocket[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(
    readonly url: string,
    readonly protocols: string[]
  ) {
    FakeSocket.all.push(this)
  }

  close() {
    this.closed = true
  }

  send(seq: number, type: string, data: unknown) {
    const text = JSON.stringify({ seq, type, data })
    this.onmessage?.({ data: text } as MessageEvent)
  }
}

const info = { baseUrl: "http://127.0.0.1:4000", token: "tok" }
const snapshot = { session: { state: "idle" }, transfers: [] }

function make() {
  const client = new QueryClient()
  const live = new LiveSocket(info, client, {
    socketClass: FakeSocket as unknown as typeof WebSocket,
    random: () => 0,
  })

  return { client, live }
}

beforeEach(() => {
  FakeSocket.all = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("LiveSocket", () => {
  it("opens the live url with exactly the two subprotocols", () => {
    const { live } = make()

    live.start()

    expect(FakeSocket.all[0].url).toBe("ws://127.0.0.1:4000/api/live")
    expect(FakeSocket.all[0].protocols).toEqual(["tailshare.v1", "tok"])
  })

  it("applies a snapshot, then events in order, and drops old ones", () => {
    const { client, live } = make()
    live.start()
    const socket = FakeSocket.all[0]

    socket.send(5, "snapshot", snapshot)
    socket.send(6, "session.state", { state: "hosting", code: "7K3Q9P" })
    socket.send(6, "session.state", { state: "idle" })

    expect(live.lastSeq).toBe(6)
    expect(client.getQueryData(keys.session)).toMatchObject({
      state: "hosting",
    })
  })

  it("closes on a gap so a new snapshot repairs it", () => {
    const { live } = make()
    live.start()
    const socket = FakeSocket.all[0]

    socket.send(0, "snapshot", snapshot)
    socket.send(3, "session.state", { state: "idle" })

    expect(socket.closed).toBe(true)
  })

  it("reconnects with 500, 1000, 2000 ... capped at 10000", () => {
    const { live } = make()
    live.start()
    const delays = [500, 1000, 2000, 4000, 8000, 10_000, 10_000]

    for (const [index, delay] of delays.entries()) {
      FakeSocket.all[index].onclose?.()
      vi.advanceTimersByTime(delay - 1)
      expect(FakeSocket.all).toHaveLength(index + 1)
      vi.advanceTimersByTime(1)
      expect(FakeSocket.all).toHaveLength(index + 2)
    }
  })

  it("starts the backoff over after a snapshot, and seq at zero", () => {
    const { live } = make()
    live.start()

    FakeSocket.all[0].onclose?.()
    vi.advanceTimersByTime(500)
    FakeSocket.all[1].send(40, "snapshot", snapshot)
    expect(live.lastSeq).toBe(40)

    FakeSocket.all[1].onclose?.()
    vi.advanceTimersByTime(500)

    expect(FakeSocket.all).toHaveLength(3)
    expect(live.lastSeq).toBe(0)
  })

  it("does not reconnect after stop", () => {
    const { live } = make()
    live.start()

    live.stop()
    vi.advanceTimersByTime(60_000)

    expect(FakeSocket.all).toHaveLength(1)
    expect(FakeSocket.all[0].closed).toBe(true)
  })
})
