import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { apiFetch } from "./client"
import { keys } from "./keys"
import type { FilePage, Side } from "./types"

/** Rows per page. The sidecar allows up to 1000. */
export const PAGE_SIZE = 100

/**
 * One page of a folder on this computer or the other one. The old page stays
 * on screen while the next one loads.
 */
export function useFiles(side: Side, path: string, offset: number) {
  return useQuery({
    queryKey: keys.filesPage(side, path, offset),
    queryFn: async () => {
      const query = new URLSearchParams({
        path,
        offset: String(offset),
        limit: String(PAGE_SIZE),
      })
      const page = await apiFetch<FilePage>(`/api/files/${side}?${query}`)

      // An empty Go slice can arrive as null.
      return { entries: page.entries ?? [], total: page.total }
    },
    placeholderData: keepPreviousData,
    retry: false,
  })
}
