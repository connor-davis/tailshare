import { useInfiniteQuery } from "@tanstack/react-query"
import { apiFetch } from "./client"
import { keys } from "./keys"

/** A base name in one local or peer folder. */
export interface FolderEntry {
  name: string
  size: number
  isDir: boolean
}

/** Loads one page on expansion; later pages are fetched only by Load more. */
export function useFolderPage(
  path: string,
  scope: "local" | "peer",
  open: boolean
) {
  return useInfiniteQuery({
    queryKey: [...keys.files, scope, path],
    initialPageParam: 0,
    enabled: open,
    staleTime: Infinity,
    queryFn: ({ pageParam }) =>
      apiFetch<{ entries: FolderEntry[]; total: number }>(
        `/api/files/${scope}?${new URLSearchParams({ path, offset: String(pageParam), limit: "100" })}`
      ),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce(
        (count, page) => count + page.entries.length,
        0
      )

      return last.entries.length && loaded < last.total ? loaded : undefined
    },
  })
}
