import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { appendChat } from "../live/apply"
import { apiFetch } from "./client"
import { keys } from "./keys"
import type { ChatMessage } from "./types"

/**
 * Chat so far. It lives in the query cache only: no persister is ever added,
 * so nothing reaches disk. It is cleared when the session ends.
 */
export function useChat(enabled: boolean) {
  return useQuery({
    queryKey: keys.chat,
    queryFn: async () => {
      const body = await apiFetch<{ items: ChatMessage[] | null }>("/api/chat")

      return body.items ?? []
    },
    enabled,
    staleTime: Infinity,
    retry: false,
  })
}

/** Send one message. The sidecar also echoes it live; the id stops doubles. */
export function useSendChat() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (text: string) =>
      apiFetch<ChatMessage>("/api/chat", { method: "POST", body: { text } }),
    onSuccess: (message) => appendChat(client, message),
  })
}
