// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { WindowState } from "../../../shared/bridge"
import { useWindowState } from "./window-state"

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove("mica")
})

function stubBridge(initial: WindowState) {
  let push: (state: WindowState) => void = () => {}
  const unsubscribe = vi.fn()
  Object.assign(window, {
    tailshare: {
      getWindowState: async () => initial,
      onWindowState: (listener: (state: WindowState) => void) => {
        push = listener
        return unsubscribe
      },
    },
  })
  return { push: (state: WindowState) => push(state), unsubscribe }
}

const hasMica = () => document.documentElement.classList.contains("mica")

describe("useWindowState", () => {
  it("adds html.mica only when main says Mica is on", async () => {
    stubBridge({ maximized: false, mica: true })
    renderHook(() => useWindowState())

    await waitFor(() => expect(hasMica()).toBe(true))
  })

  it("leaves the page solid when Mica is off", async () => {
    stubBridge({ maximized: true, mica: false })
    const { result } = renderHook(() => useWindowState())

    await waitFor(() => expect(result.current.maximized).toBe(true))
    expect(hasMica()).toBe(false)
  })

  it("follows a live change and unsubscribes on unmount", async () => {
    const { push, unsubscribe } = stubBridge({ maximized: false, mica: true })
    const { result, unmount } = renderHook(() => useWindowState())
    await waitFor(() => expect(result.current.mica).toBe(true))

    act(() => push({ maximized: true, mica: false }))

    expect(result.current).toEqual({ maximized: true, mica: false })
    expect(hasMica()).toBe(false)
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
