import { useQuery } from "@tanstack/react-query"
import { apiFetch, getConnection } from "./client"
import { keys } from "./keys"
import type { ScreenState } from "./types"

/** Reads initial screen metadata; the live socket owns subsequent changes. */
export function useScreens() {
  return useQuery({
    queryKey: keys.screens,
    queryFn: ({ signal }) =>
      apiFetch<ScreenState>("/api/screen").then((state) => {
        if (signal.aborted) throw new Error("Screen read cancelled.")
        return state
      }),
    staleTime: Infinity,
    retry: false,
  })
}

/** Opens a dedicated authenticated binary socket, with no token in the URL. */
export async function screenSocket(path: string): Promise<WebSocket> {
  const info = await getConnection()
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `${info.baseUrl.replace(/^http/, "ws")}${path}`,
      ["tailshare.v1", info.token]
    )
    socket.binaryType = "arraybuffer"
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error("Screen connection timed out."))
    }, 10_000)
    socket.onopen = () => {
      clearTimeout(timer)
      resolve(socket)
    }
    socket.onerror = socket.onclose = () => {
      clearTimeout(timer)
      reject(new Error("Could not connect to the screen."))
    }
  })
}
