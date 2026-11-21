import { useEffect, useState } from "react"

/**
 * True while the save folder works. Follows main's pushes, and never lets a
 * late first read replace a newer push. Assumes true until main says otherwise.
 */
export function useDownloadsOk(): boolean {
  const [ok, setOk] = useState(true)

  useEffect(() => {
    let alive = true
    let pushed = false
    const unsubscribe = window.tailshare.onDownloadsStatus((next) => {
      pushed = true
      if (alive) setOk(next.ok)
    })
    window.tailshare
      .getDownloadsStatus()
      .then((current) => {
        if (alive && !pushed) setOk(current.ok)
      })
      // ponytail: if the read fails the push still arrives; no second path.
      .catch(() => {})

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return ok
}
