import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { liveRevision } from "../live/apply"
import { apiFetch } from "./client"
import { keys } from "./keys"
import type { SessionState } from "./types"

/** The session. The live socket keeps it fresh, so it never refetches alone. */
export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: () => apiFetch<SessionState>("/api/session"),
    staleTime: Infinity,
  })
}

/** Run a call that answers with the new session state and store the answer. */
function useSessionCall<Input>(send: (input: Input) => Promise<SessionState>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: send,
    // The socket may have said something newer while the call was away.
    onMutate: () => liveRevision(client),
    onSuccess: (state, _input, started) => {
      if (liveRevision(client) === started)
        client.setQueryData(keys.session, state)
    },
  })
}

/**
 * Start hosting. The answer carries the code. `displayName` is the name from
 * Settings; without it the sidecar uses the computer name. The call takes the
 * room's name; blank lets the sidecar name it "<name>'s room".
 */
export function useHost(displayName?: string) {
  return useSessionCall<string | undefined>((roomName) =>
    apiFetch<SessionState>("/api/session/host", {
      method: "POST",
      body: { displayName, roomName },
    })
  )
}

/** Join the other computer by code, introducing this one as `displayName`. */
export function useJoin(displayName?: string) {
  return useSessionCall<string>((code) =>
    apiFetch<SessionState>("/api/session/join", {
      method: "POST",
      body: { code, displayName },
    })
  )
}

/** Leave the session, or stop waiting for a joiner. */
export function useLeave() {
  return useSessionCall<void>(() =>
    apiFetch<SessionState>("/api/session", { method: "DELETE" })
  )
}

/** Approve the current join request. */
export function useAllowJoin() {
  return useSessionCall<number>((id) =>
    apiFetch<SessionState>(`/api/session/joins/${id}/allow`, { method: "POST" })
  )
}

/** Refuse the current join request. */
export function useDenyJoin() {
  return useSessionCall<number>((id) =>
    apiFetch<SessionState>(`/api/session/joins/${id}/deny`, { method: "POST" })
  )
}
