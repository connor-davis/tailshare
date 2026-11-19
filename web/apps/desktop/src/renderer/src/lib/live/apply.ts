import type { QueryClient } from "@tanstack/react-query"
import { announce } from "../../components/status-region"
import { keys } from "../api/keys"
import type {
  ChatMessage,
  FolderInfo,
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

/** Add a chat message unless one with its id is already there. */
export function appendChat(client: QueryClient, message: ChatMessage): void {
  client.setQueryData<ChatMessage[]>(keys.chat, (list = []) =>
    list.some((entry) => entry.id === message.id) ? list : [...list, message]
  )
}

/** Drop what belongs to a session that is over. Chat must never linger. */
function clearSession(client: QueryClient): void {
  client.removeQueries({ queryKey: keys.chat })
  client.removeQueries({ queryKey: keys.files })
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
      client.setQueryData<SessionState>(keys.session, snapshot.session)
      client.setQueryData<FolderInfo | null>(keys.folder, snapshot.folder)
      const now = Date.now()
      client.setQueryData<TransferView[]>(
        keys.transfers,
        (snapshot.transfers ?? []).map((item) => ({ ...item, sampledAt: now }))
      )

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
      client.setQueryData<SessionState>(keys.session, session)
      if (session.state === "idle") clearSession(client)

      return
    }

    case "chat.message":
      appendChat(client, event.data as ChatMessage)

      return

    case "transfer.progress":
    case "transfer.state": {
      const item = event.data as TransferItem
      const known = client
        .getQueryData<TransferView[]>(keys.transfers)
        ?.find((entry) => entry.id === item.id)
      upsertTransfer(client, item)

      if (item.state === "done" || item.state === "failed") {
        void client.invalidateQueries({ queryKey: keys.files })
      }
      if (known?.state !== item.state) {
        if (item.state === "done") {
          announce(`${fileName(item.source)} finished.`)
        } else if (item.state === "failed") {
          announce(`${fileName(item.source)} failed.`, "assertive")
        }
      }

      return
    }

    default:
      // Unknown types come from a newer sidecar; ignoring them is safe.
      return
  }
}
