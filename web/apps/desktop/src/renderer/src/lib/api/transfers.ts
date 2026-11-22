import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { upsertTransfer } from "../live/apply"
import { apiFetch } from "./client"
import { keys } from "./keys"
import type { TransferItem, TransferRequest, TransferView } from "./types"

/** The transfer list. Live events keep it fresh. */
export function useTransfers() {
  return useQuery({
    queryKey: keys.transfers,
    queryFn: async () => {
      const body = await apiFetch<{ items: TransferItem[] | null }>(
        "/api/transfers"
      )

      return (body.items ?? []) as TransferView[]
    },
    staleTime: Infinity,
  })
}

// A reply only adds a transfer the socket has not announced yet. If the socket
// already told us about it, that news is newer than this answer.
function addIfNew(client: QueryClient, item: TransferItem): void {
  const list = client.getQueryData<TransferView[]>(keys.transfers) ?? []
  if (!list.some((entry) => entry.id === item.id)) upsertTransfer(client, item)
}

/**
 * Starts a download. Main decides the place: a Save dialog for "Ask every time",
 * the save folder otherwise. Resolves to null when the person cancels. The
 * live socket reports progress.
 */
export function useStartTransfer() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (request: TransferRequest) =>
      (await window.tailshare.startDownload({
        source: request.source,
        name: request.destination,
        ...(request.folder ? { folder: true } : {}),
      })) as (TransferItem & { items?: TransferItem[] }) | null,
    onSuccess: (item) => {
      if (item?.items) item.items.forEach((entry) => addIfNew(client, entry))
      else if (item) addIfNew(client, item)
    },
  })
}

/** What a button can ask of one transfer. */
export type TransferAction = "pause" | "resume" | "cancel"

/** Pause, resume or cancel one transfer. A 409 message is shown as it is. */
export function useTransferAction() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: TransferAction }) =>
      action === "cancel"
        ? apiFetch<TransferItem>(`/api/transfers/${encodeURIComponent(id)}`, {
            method: "DELETE",
          })
        : apiFetch<TransferItem>(
            `/api/transfers/${encodeURIComponent(id)}/${action}`,
            { method: "POST" }
          ),
    onSuccess: (item) => addIfNew(client, item),
  })
}

/** Clears finished rows on the sidecar. Running and paused work stays. */
export function useClearTransfers() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: () =>
      apiFetch<{ removed: string[] }>("/api/transfers/clear", {
        method: "POST",
      }),
    // The socket also sends "transfer.removed"; this covers a slow socket.
    onSuccess: ({ removed }) =>
      client.setQueryData<TransferView[]>(keys.transfers, (list = []) =>
        list.filter((entry) => !removed.includes(entry.id))
      ),
  })
}
