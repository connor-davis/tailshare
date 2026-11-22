import { QueryClient } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { keys } from "../api/keys"
import type {
  ChatMessage,
  SessionState,
  TransferItem,
  TransferView,
} from "../api/types"
import {
  CHAT_LIMIT,
  appendChat,
  applyEvent,
  mergeChat,
  upsertTransfer,
} from "./apply"

const item = (over: Partial<TransferItem> = {}): TransferItem => ({
  id: "t1",
  direction: "upload",
  source: "a.txt",
  destination: "a.txt",
  size: 100,
  bytes: 0,
  state: "running",
  ...over,
})

const chat = (id: string): ChatMessage => ({
  seq: 1,
  id,
  fromPeer: true,
  text: id,
  time: "2026-11-20T10:00:00Z",
})

const connected: SessionState = {
  state: "connected",
  peer: { displayName: "Other", sharedFolderName: "Pics" },
}

describe("applyEvent", () => {
  it("seeds session and transfers from a snapshot", () => {
    const client = new QueryClient()

    applyEvent(client, {
      seq: 0,
      type: "snapshot",
      data: {
        session: connected,
        transfers: [item()],
      },
    })

    expect(client.getQueryData(keys.session)).toEqual(connected)
    expect(client.getQueryData<TransferView[]>(keys.transfers)).toHaveLength(1)
  })

  it("keeps shared apps from the snapshot and live changes, then clears them", () => {
    const client = new QueryClient()
    const app = {
      id: "a",
      label: "Web",
      port: 80,
      ownerId: "m",
      ownerName: "Hana",
      open: false,
    }
    const state = { mine: [], others: [app], unsupported: [] }

    applyEvent(client, {
      seq: 0,
      type: "snapshot",
      data: { session: connected, transfers: [], forwards: state },
    })
    expect(client.getQueryData(keys.forwards)).toEqual(state)

    const next = { ...state, others: [] }
    applyEvent(client, { seq: 1, type: "forward.changed", data: next })
    expect(client.getQueryData(keys.forwards)).toEqual(next)

    applyEvent(client, {
      seq: 2,
      type: "session.state",
      data: { state: "idle" },
    })
    expect(client.getQueryData(keys.forwards)).toBeUndefined()
  })

  it("replaces the session on session.state", () => {
    const client = new QueryClient()
    client.setQueryData(keys.session, { state: "idle" })

    applyEvent(client, { seq: 1, type: "session.state", data: connected })

    expect(client.getQueryData(keys.session)).toEqual(connected)
  })

  it("forgets chat when the session goes idle", () => {
    const client = new QueryClient()
    client.setQueryData(keys.chat, [chat("a")])

    applyEvent(client, {
      seq: 2,
      type: "session.state",
      data: { state: "idle" },
    })

    expect(client.getQueryData(keys.chat)).toBeUndefined()
  })

  it("keeps the attachment on a chat message", () => {
    const client = new QueryClient()
    const attachment = { name: "a.pdf", path: "a.pdf", size: 5 }

    applyEvent(client, {
      seq: 1,
      type: "chat.message",
      data: { ...chat("a"), text: "", attachment },
    })

    expect(
      client.getQueryData<ChatMessage[]>(keys.chat)?.[0].attachment
    ).toEqual(attachment)
  })

  it("appends chat once and keeps order", () => {
    const client = new QueryClient()

    for (const id of ["a", "b", "a"]) {
      applyEvent(client, { seq: 1, type: "chat.message", data: chat(id) })
    }

    expect(
      client.getQueryData<ChatMessage[]>(keys.chat)?.map((m) => m.id)
    ).toEqual(["a", "b"])
  })

  it("upserts transfers by id for progress and state", () => {
    const client = new QueryClient()

    applyEvent(client, { seq: 1, type: "transfer.state", data: item() })
    applyEvent(client, {
      seq: 2,
      type: "transfer.progress",
      data: item({ bytes: 50 }),
    })
    applyEvent(client, {
      seq: 3,
      type: "transfer.state",
      data: item({ id: "t2", state: "queued" }),
    })

    const list = client.getQueryData<TransferView[]>(keys.transfers)
    expect(list).toHaveLength(2)
    expect(list?.[0].bytes).toBe(50)
  })

  it("drops the rows a removed event names", () => {
    const client = new QueryClient()
    applyEvent(client, { seq: 1, type: "transfer.state", data: item() })
    applyEvent(client, {
      seq: 2,
      type: "transfer.state",
      data: item({ id: "t2" }),
    })

    applyEvent(client, {
      seq: 3,
      type: "transfer.removed",
      data: { ids: ["t1"] },
    })

    const list = client.getQueryData<TransferView[]>(keys.transfers)
    expect(list?.map((row) => row.id)).toEqual(["t2"])
  })

  it("ignores unknown types", () => {
    const client = new QueryClient()

    applyEvent(client, { seq: 1, type: "something.new", data: {} })

    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })
})

describe("toasts", () => {
  afterEach(() => vi.unstubAllGlobals())

  const stub = () => {
    const notify = vi.fn(async () => {})
    vi.stubGlobal("window", { tailshare: { notify } })
    return notify
  }

  it("asks for a toast once when a transfer finishes, not on progress", () => {
    const notify = stub()
    const client = new QueryClient()
    const done = item({ state: "done", source: "C:\\x\\a.txt" })

    applyEvent(client, { seq: 1, type: "transfer.state", data: item() })
    applyEvent(client, {
      seq: 2,
      type: "transfer.progress",
      data: item({ bytes: 50 }),
    })
    applyEvent(client, { seq: 3, type: "transfer.state", data: done })
    applyEvent(client, { seq: 4, type: "transfer.state", data: done })

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({ kind: "done", name: "a.txt" })
  })

  it("says so when a transfer fails", () => {
    const notify = stub()

    applyEvent(new QueryClient(), {
      seq: 1,
      type: "transfer.state",
      data: item({ state: "failed" }),
    })

    expect(notify).toHaveBeenCalledWith({ kind: "failed", name: "a.txt" })
  })

  it("asks once for a new join request, never on a snapshot", () => {
    const notify = stub()
    const client = new QueryClient()
    const waiting = (id: string, displayName: string) =>
      ({
        state: "hosting",
        join: { id, displayName },
      }) as unknown as SessionState

    applyEvent(client, {
      seq: 1,
      type: "snapshot",
      data: { session: waiting("j1", "Pat"), transfers: [], chat: [] },
    } as never)
    expect(notify).not.toHaveBeenCalled()

    const next = { seq: 2, type: "session.state", data: waiting("j2", "Sam") }
    applyEvent(client, next as never)
    applyEvent(client, { ...next, seq: 3 } as never)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({ kind: "join", name: "Sam" })
  })

  it("keeps working when there is no bridge", () => {
    expect(() =>
      applyEvent(new QueryClient(), {
        seq: 1,
        type: "transfer.state",
        data: item({ state: "done" }),
      })
    ).not.toThrow()
  })
})

describe("upsertTransfer", () => {
  it("shows no speed until two samples exist, then smooths", () => {
    const client = new QueryClient()
    const speed = () =>
      client.getQueryData<TransferView[]>(keys.transfers)?.[0].speed

    upsertTransfer(client, item({ bytes: 0 }), 1000)
    expect(speed()).toBeUndefined()

    upsertTransfer(client, item({ bytes: 1000 }), 2000)
    expect(speed()).toBe(1000)
  })
})

describe("live state is newer than HTTP", () => {
  it("keeps a snapshot when an older session read finishes after it", async () => {
    const client = new QueryClient()
    let finish: (state: SessionState) => void = () => {}
    const read = client
      .fetchQuery({
        queryKey: keys.session,
        queryFn: () => new Promise<SessionState>((r) => (finish = r)),
      })
      .catch(() => {})
    const hosting: SessionState = { state: "hosting", role: "host" }

    applyEvent(client, {
      seq: 0,
      type: "snapshot",
      data: { session: hosting, transfers: [] },
    })
    finish({ state: "idle" })
    await read

    expect(client.getQueryData(keys.session)).toEqual(hosting)
  })

  it("keeps live transfers when an older list read finishes after them", async () => {
    const client = new QueryClient()
    let finish: (list: TransferView[]) => void = () => {}
    const read = client
      .fetchQuery({
        queryKey: keys.transfers,
        queryFn: () => new Promise<TransferView[]>((r) => (finish = r)),
      })
      .catch(() => {})

    applyEvent(client, { seq: 1, type: "transfer.state", data: item() })
    finish([])
    await read

    expect(client.getQueryData<TransferView[]>(keys.transfers)).toHaveLength(1)
  })

  it("merges a chat read with messages that arrived while it ran", () => {
    const merged = mergeChat([chat("a"), chat("b")], [chat("b"), chat("c")])

    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"])
  })
})

describe("chat memory bound", () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) => chat(`m${i}`))

  it("keeps only the newest 200 messages when appending", () => {
    const client = new QueryClient()

    for (const message of many(CHAT_LIMIT + 1)) appendChat(client, message)

    const list = client.getQueryData<ChatMessage[]>(keys.chat)!
    expect(list).toHaveLength(CHAT_LIMIT)
    expect(list[0]!.id).toBe("m1")
    // A message that rolled off can come back; one that stayed cannot double.
    appendChat(client, chat("m1"))
    expect(client.getQueryData<ChatMessage[]>(keys.chat)).toHaveLength(
      CHAT_LIMIT
    )
  })

  it("caps a merged history too", () => {
    expect(mergeChat(many(150), many(300).slice(100))).toHaveLength(CHAT_LIMIT)
    expect(mergeChat(many(300))[0]!.id).toBe("m100")
  })
})

it("keeps optional member paths from session events", () => {
  const client = new QueryClient()
  const state: SessionState = {
    ...connected,
    members: [
      {
        id: "peer",
        displayName: "Other",
        path: { kind: "relay", region: "FRA" },
      },
    ],
  }
  applyEvent(client, { seq: 1, type: "session.state", data: state })
  expect(
    client.getQueryData<SessionState>(keys.session)?.members?.[0]?.path
  ).toEqual({ kind: "relay", region: "FRA" })
})
