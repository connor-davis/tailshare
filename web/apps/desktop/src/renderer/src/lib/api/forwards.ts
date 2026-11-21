import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "./client"
import { keys } from "./keys"
import type { ForwardItem, ForwardState } from "./types"

/** Shared apps. The socket keeps it fresh; this only fills the first read. */
export function useForwards(enabled: boolean) {
  return useQuery({
    queryKey: keys.forwards,
    queryFn: () => apiFetch<ForwardState>("/api/forwards"),
    enabled,
    staleTime: Infinity,
    retry: false,
  })
}

/** Keep the cache in step with a reply that already carries the whole state. */
function useStateMutation<T>(
  run: (input: T) => Promise<ForwardState | ForwardItem>
) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: run,
    // The socket also says so; this makes the button answer at once.
    onSettled: () => void client.invalidateQueries({ queryKey: keys.forwards }),
  })
}

/** Share a local port with the room. */
export function useShareApp() {
  return useStateMutation((draft: { port: number; label: string }) =>
    apiFetch<ForwardItem>("/api/forwards", { method: "POST", body: draft })
  )
}

/** Stop sharing one of my apps. */
export function useStopApp() {
  return useStateMutation((id: string) =>
    apiFetch<ForwardState>(`/api/forwards/${id}`, { method: "DELETE" })
  )
}

/** Start listening on this computer for someone else's app. */
export function useOpenApp() {
  return useStateMutation((id: string) =>
    apiFetch<ForwardItem>(`/api/forwards/${id}/open`, { method: "POST" })
  )
}

/** Stop listening for someone else's app. */
export function useCloseApp() {
  return useStateMutation((id: string) =>
    apiFetch<ForwardState>(`/api/forwards/${id}/open`, { method: "DELETE" })
  )
}
