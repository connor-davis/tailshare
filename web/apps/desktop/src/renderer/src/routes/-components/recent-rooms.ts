import { useEffect, useRef, useState } from "react"
import type { RecentRoom } from "../../../../shared/bridge"
import { foldCode } from "@/lib/code-input"

/**
 * Saves a room in the recent list. The name is "<owner>'s room" when the
 * owner's name is known, otherwise the code itself.
 */
export function rememberRoom(owner: string | undefined, code: string) {
  const bare = foldCode(code)
  if (!bare) return

  const name = owner ? `${owner}'s room`.slice(0, 64) : bare

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
