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

/** Ask the sidecar to move one file. The live socket reports its progress. */
export function useStartTransfer() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (request: TransferRequest) =>
      apiFetch<TransferItem>("/api/transfers", {
        method: "POST",
        body: request,
      }),
    onSuccess: (item) => addIfNew(client, item),
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
