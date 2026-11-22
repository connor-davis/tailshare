import type { QueryClient } from "@tanstack/react-query"
import { keys } from "./keys"

/** Clear the previous room before active queries read the selected room. */
export function resetRoomData(client: QueryClient): void {
  for (const queryKey of [
    keys.chat,
    keys.transfers,
    keys.files,
    keys.forwards,
    ["preview", "room"],
  ]) {
    void client.cancelQueries({ queryKey })
    void client.resetQueries({ queryKey })
  }
}
