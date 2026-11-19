import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { apiFetch } from "./client"
import { keys } from "./keys"
import type { FolderInfo } from "./types"

/**
 * The shared folder. `undefined` means the first snapshot has not arrived;
 * `null` means no folder was chosen yet. Only live data and
 * {@link useChooseFolder} set it.
 */
export function useFolder() {
  return useQuery<FolderInfo | null>({
    queryKey: keys.folder,
    queryFn: skipToken,
    staleTime: Infinity,
  })
}

/**
 * Open the native picker, then tell the sidecar. Resolves to `null` when the
 * picker was cancelled, so the caller does nothing.
 */
export function useChooseFolder() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const path = await window.tailshare.chooseFolder()
      if (path === null) return null

      return apiFetch<FolderInfo>("/api/folder", {
        method: "PUT",
        body: { path },
      })
    },
    onSuccess: (folder) => {
      if (folder) client.setQueryData(keys.folder, folder)
    },
  })
}
