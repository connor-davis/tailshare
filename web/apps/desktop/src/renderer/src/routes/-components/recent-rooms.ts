import { useEffect, useRef, useState } from "react"
import type { RecentRoom } from "../../../../shared/bridge"
import { foldCode } from "@/lib/code-input"

/**
 * Saves a room in the recent list under the name the host gave it, or the
 * code itself when that name is not known.
 */
export function rememberRoom(roomName: string | undefined, code: string) {
  const bare = foldCode(code)
  if (!bare) return

  const name = roomName ? roomName.slice(0, 64) : bare

  // A failed save only costs a missing entry in the list.
  Promise.resolve(window.tailshare.touchRecentRoom({ name, code: bare })).catch(
    () => {}
  )
}

/** The recent rooms, newest first, kept in step with the main process. */
export function useRecentRooms(): RecentRoom[] {
  const [rooms, setRooms] = useState<RecentRoom[]>([])
  const pushed = useRef(false)

  useEffect(() => {
    let alive = true

    // Listen first, then read, so a change in between is not lost.
    const unsubscribe = window.tailshare.onRecentRoomsChanged((next) => {
      pushed.current = true
      if (alive) setRooms(next)
    })

    Promise.resolve(window.tailshare.getRecentRooms())
      .then((saved) => {
        if (alive && !pushed.current) setRooms(saved)
      })
      .catch(() => {})

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return rooms
}
