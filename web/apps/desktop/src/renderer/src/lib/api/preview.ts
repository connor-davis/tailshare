import { useQuery } from "@tanstack/react-query"
import type { FilePreview } from "../../../../shared/bridge"
import { apiFetch } from "./client"

/**
 * A small preview of a file this computer shared. The sidecar reads the file
 * under the same path rules as a download. Kept in memory only, never on disk.
 */
export function useRoomPreview(path: string, enabled: boolean) {
  return useQuery({
    queryKey: ["preview", "room", path],
    queryFn: () =>
      apiFetch<FilePreview>(
        `/api/room/preview?path=${encodeURIComponent(path)}`
      ),
    enabled,
    staleTime: Infinity,
    retry: false,
  })
}

/**
 * A small preview of a file that was downloaded. The page sends only the
 * transfer id; main finds the saved file.
 */
export function useDownloadPreview(transferId: string | undefined) {
  return useQuery({
    queryKey: ["preview", "download", transferId],
    queryFn: () => window.tailshare.previewDownload(transferId as string),
    enabled: !!transferId,
    staleTime: Infinity,
    retry: false,
  })
}
