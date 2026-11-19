import { useSyncExternalStore } from "react"

interface Message {
  text: string
  assertive: boolean
}

let current: Message = { text: "", assertive: false }
const listeners = new Set<() => void>()

/**
 * Say something to screen readers. Polite waits for a pause; assertive
 * interrupts. Progress is never announced, only state changes.
 */
export function announce(
  text: string,
  mode: "polite" | "assertive" = "polite"
) {
  // A new object each time, so repeating the same words is announced again.
  current = { text, assertive: mode === "assertive" }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/** The one owner of live text. Mount it once, in the root route. */
export function StatusRegion() {
  const message = useSyncExternalStore(subscribe, () => current)

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {message.assertive ? "" : message.text}
      </div>
      <div role="alert" className="sr-only">
        {message.assertive ? message.text : ""}
      </div>
    </>
  )
}
