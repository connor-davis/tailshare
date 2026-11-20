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
    stubBridge({ mica: true })
    renderHook(() => useWindowState())

    await waitFor(() => expect(hasMica()).toBe(true))
  })

  it("leaves the page solid when Mica is off", async () => {
    stubBridge({ mica: false })
    renderHook(() => useWindowState())

    await waitFor(() => expect(hasMica()).toBe(false))
  })

  it("follows a live change and unsubscribes on unmount", async () => {
    const { push, unsubscribe } = stubBridge({ mica: true })
    const { result, unmount } = renderHook(() => useWindowState())
    await waitFor(() => expect(result.current.mica).toBe(true))

    act(() => push({ mica: false }))

    expect(result.current).toEqual({ mica: false })
    expect(hasMica()).toBe(false)
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
