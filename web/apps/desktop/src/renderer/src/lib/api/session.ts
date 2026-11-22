import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { resetRoomData } from "./room-cache"
import { liveRevision } from "../live/apply"
import { apiFetch } from "./client"
import { keys } from "./keys"
import type { RoomsState, SessionState } from "./types"

/** The session. The live socket keeps it fresh, so it never refetches alone. */
export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: () => apiFetch<SessionState>("/api/session"),
    staleTime: Infinity,
  })
}

/** Run a call that answers with the new session state and store the answer. */
function useSessionCall<Input>(
  send: (input: Input) => Promise<SessionState>,
  selects = false
) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: send,
    // The socket may have said something newer while the call was away.
    onMutate: () => liveRevision(client),
    onSuccess: (state, _input, started) => {
      const previous = client.getQueryData<SessionState>(keys.session)
      if (
        (selects && state.room && state.room !== previous?.room) ||
        liveRevision(client) === started
      ) {
        client.setQueryData(keys.session, state)
        if (previous?.room !== state.room) resetRoomData(client)
      }
      void client.invalidateQueries({ queryKey: keys.rooms })
    },
  })
}

/**
 * Start hosting. The answer carries the code. `displayName` is the name from
 * Settings; without it the sidecar uses the computer name. The call takes the
 * room's name; blank lets the sidecar name it "<name>'s room". Pass
 * `{ roomName, code }` to reopen a saved room under its old code.
 */
export function useHost(displayName?: string) {
  return useSessionCall<
    string | undefined | { roomName: string; code: string }
  >(
    (room) =>
      apiFetch<SessionState>("/api/session/host", {
        method: "POST",
        body: {
          displayName,
          ...(typeof room === "object" ? room : { roomName: room }),
        },
      }),
    true
  )
}

/** Join the other computer by code, introducing this one as `displayName`. */
export function useJoin(displayName?: string) {
  return useSessionCall<string>(
    (code) =>
      apiFetch<SessionState>("/api/session/join", {
        method: "POST",
        body: { code, displayName },
      }),
    true
  )
}

/** Leave the session, or stop waiting for a joiner. */
export function useLeave() {
  return useSessionCall<string | undefined>(
    (room) =>
      apiFetch<SessionState>(
        room ? `/api/session?room=${encodeURIComponent(room)}` : "/api/session",
        { method: "DELETE" }
      ),
    true
  )
}

/** Approve the current join request. */
export function useAllowJoin() {
  return useSessionCall<number>((id) =>
    apiFetch<SessionState>(`/api/session/joins/${id}/allow`, { method: "POST" })
  )
}

/**
 * Trust the computer behind the current join request, then let it in. Main
 * does both, so the page never sees or names a key.
 */
export function useTrustJoin() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => window.tailshare.trustJoin(id),
    // The allow changes the session, so ask for the new state.
    onSettled: () => client.invalidateQueries({ queryKey: keys.session }),
  })
}

/** Remove one member from the room. Only the host can; the sidecar says so otherwise. */
export function useRemoveMember() {
  return useSessionCall<string>((id) =>
    apiFetch<SessionState>(`/api/session/members/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
  )
}

/** Refuse the current join request. */
export function useDenyJoin() {
  return useSessionCall<number>((id) =>
    apiFetch<SessionState>(`/api/session/joins/${id}/deny`, { method: "POST" })
  )
}

/** Open rooms, maintained by the live socket. */
export function useRooms() {
  return useQuery({
    queryKey: keys.rooms,
    queryFn: () => apiFetch<RoomsState>("/api/rooms"),
    staleTime: Infinity,
  })
}

/** Select a room before loading any of its active-default data. */
export function useActivateRoom() {
  return useSessionCall<string>(
    (room) =>
      apiFetch<SessionState>("/api/rooms/active", {
        method: "POST",
        body: { room },
      }),
    true
  )
}
