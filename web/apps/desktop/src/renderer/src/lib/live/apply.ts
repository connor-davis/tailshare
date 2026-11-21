import type { QueryClient } from "@tanstack/react-query"
import { announce } from "../../components/status-region"
import { keys } from "../api/keys"
import type {
  ChatMessage,
  ForwardState,
  LiveEvent,
  SessionState,
  Snapshot,
  TransferItem,
  TransferView,
} from "../api/types"

/** Weight of the newest sample when smoothing speed. */
const NEW_SAMPLE = 0.4

/** Put a transfer in the list, replacing the one with the same id. */
export function upsertTransfer(
  client: QueryClient,
  item: TransferItem,
  now = Date.now()
): void {
  client.setQueryData<TransferView[]>(keys.transfers, (list = []) => {
    const previous = list.find((entry) => entry.id === item.id)

    // Speed comes from how fast `bytes` grew between two events.
    let speed: number | undefined
    if (
      previous?.sampledAt !== undefined &&
      item.state === "running" &&
      item.bytes > previous.bytes &&
      now > previous.sampledAt
    ) {
      const instant =
        ((item.bytes - previous.bytes) * 1000) / (now - previous.sampledAt)
      speed =
        previous.speed === undefined
          ? instant
          : previous.speed * (1 - NEW_SAMPLE) + instant * NEW_SAMPLE
    } else if (item.state === "running") {
      speed = previous?.speed
    }

    const next: TransferView = { ...item, speed, sampledAt: now }

    return previous
      ? list.map((entry) => (entry.id === item.id ? next : entry))
      : [...list, next]
  })
}

/** Most chat messages the screen keeps, like the sidecar's own history. */
export const CHAT_LIMIT = 200

// How many live session or transfer events each client has applied. An HTTP
// reply that started before one of them is older than the socket's word.
const liveRevisions = new WeakMap<QueryClient, number>()

/** Count of live events applied so far; compare before and after a request. */
export function liveRevision(client: QueryClient): number {
  return liveRevisions.get(client) ?? 0
}

// The socket owns session and transfers: stop reads still in flight, so their
// older answer cannot land on top of what the socket just said.
function claimLive(client: QueryClient, key: readonly unknown[]): void {
  liveRevisions.set(client, liveRevision(client) + 1)
  void client.cancelQueries({ queryKey: key })
}

/**
 * Join a chat history read with what the socket delivered meanwhile. History
 * comes first; live messages it lacks follow. The newest {@link CHAT_LIMIT} stay.
 */
export function mergeChat(
  history: ChatMessage[],
  live: ChatMessage[] = []
): ChatMessage[] {
  const known = new Set(history.map((entry) => entry.id))
  const extra = live.filter((entry) => !known.has(entry.id))

  return [...history, ...extra].slice(-CHAT_LIMIT)
}

/** Add a chat message unless one with its id is already there. */
export function appendChat(client: QueryClient, message: ChatMessage): void {
  client.setQueryData<ChatMessage[]>(keys.chat, (list = []) =>
    list.some((entry) => entry.id === message.id)
      ? list
      : [...list, message].slice(-CHAT_LIMIT)
  )
}

/** Drop what belongs to a session that is over. Chat must never linger. */
function clearSession(client: QueryClient): void {
  client.removeQueries({ queryKey: keys.chat })
  client.removeQueries({ queryKey: keys.forwards })
  client.setQueryData<TransferView[]>(keys.transfers, [])
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * Turn one live message into cache updates. This is the only place live data
 * enters the screens. A snapshot always comes first on a new socket.
 */
export function applyEvent(client: QueryClient, event: LiveEvent): void {
  switch (event.type) {
    case "snapshot": {
      const snapshot = event.data as Snapshot
      claimLive(client, keys.session)
      void client.cancelQueries({ queryKey: keys.transfers })
      client.setQueryData<SessionState>(keys.session, snapshot.session)
      const now = Date.now()
      client.setQueryData<TransferView[]>(
        keys.transfers,
        (snapshot.transfers ?? []).map((item) => ({ ...item, sampledAt: now }))
      )

      if (snapshot.forwards)
        client.setQueryData<ForwardState>(keys.forwards, snapshot.forwards)

      // The snapshot carries no chat, so read it again after every socket.
      if (snapshot.session.state === "connected") {
        void client.invalidateQueries({ queryKey: keys.chat })
      } else {
        clearSession(client)
      }

      return
    }

    case "session.state": {
      const session = event.data as SessionState
      claimLive(client, keys.session)
      client.setQueryData<SessionState>(keys.session, session)
      if (session.state === "idle") clearSession(client)

      return
    }

    case "chat.message":
      appendChat(client, event.data as ChatMessage)

      return

    case "forward.changed":
      client.setQueryData<ForwardState>(
        keys.forwards,
        event.data as ForwardState
      )

      return

    case "transfer.progress":
    case "transfer.state": {
      const item = event.data as TransferItem
      claimLive(client, keys.transfers)
      const known = client
        .getQueryData<TransferView[]>(keys.transfers)
        ?.find((entry) => entry.id === item.id)
      upsertTransfer(client, item)

      if (known?.state !== item.state) {
        if (item.state === "done") {
          announce(`${fileName(item.source)} finished.`)
        } else if (item.state === "failed") {
          announce(`${fileName(item.source)} failed.`, "assertive")
        }
      }

      return
    }

    case "transfer.removed": {
      const { ids } = event.data as { ids: string[] }
      claimLive(client, keys.transfers)
      client.setQueryData<TransferView[]>(keys.transfers, (list = []) =>
        list.filter((entry) => !ids.includes(entry.id))
      )

      return
    }

    default:
      // Unknown types come from a newer sidecar; ignoring them is safe.
      return
  }
}
