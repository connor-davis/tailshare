// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TailshareBridge, UpdateStatus } from "../../../../shared/bridge"
import { UpdatesCard } from "./updates-card"

let listener: (status: UpdateStatus) => void
const unsubscribe = vi.fn()
const getSettings = vi.fn(async () => ({ updateChannel: "latest" as const }))
const restartToUpdate = vi.fn(async () => {})
const setUpdateChannel = vi.fn(async (updateChannel) => ({ updateChannel }))

beforeEach(() => {
  vi.clearAllMocks()
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.releasePointerCapture = vi.fn()
  vi.stubGlobal("tailshare", {
    getSettings,
    getUpdateStatus: async () => ({ state: "current" }),
    setUpdateChannel,
    restartToUpdate,
    onUpdateStatus: (next: (status: UpdateStatus) => void) => {
      listener = next
      return unsubscribe
    },
  } as unknown as TailshareBridge)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Updates card", () => {
  it("loads Stable by default and changes to Nightly", async () => {
    render(<UpdatesCard />)
    await screen.findByText("No update available.")
    const select = screen.getByRole("combobox", { name: "Release channel" })
    expect(select.textContent).toContain("Stable")
    fireEvent.keyDown(select, { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("option", { name: "Nightly" }))
    await waitFor(() =>
      expect(setUpdateChannel).toHaveBeenCalledWith("nightly")
    )
    await screen.findByText(
      "Nightly follows development builds only. Changes may be unfinished."
    )
  })

  it("shows pushed progress and restart readiness and unsubscribes", async () => {
    const view = render(<UpdatesCard />)
    await screen.findByText("No update available.")
    act(() => listener({ state: "downloading", percent: 42 }))
    expect(screen.getByRole("status").textContent).toContain("42%")
    act(() => listener({ state: "ready" }))
    fireEvent.click(screen.getByRole("button", { name: "Restart to update" }))
    await waitFor(() => expect(restartToUpdate).toHaveBeenCalledOnce())
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it("keeps a failed restart actionable and reports a safe error", async () => {
    restartToUpdate.mockRejectedValueOnce(new Error("internal path"))
    render(<UpdatesCard />)
    await screen.findByText("No update available.")
    act(() => listener({ state: "ready" }))
    fireEvent.click(screen.getByRole("button", { name: "Restart to update" }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not restart to update. Try again."
    )
    expect(
      screen
        .getByRole("button", { name: "Restart to update" })
        .hasAttribute("disabled")
    ).toBe(false)
  })

  it("handles loading failure without exposing internal details", async () => {
    getSettings.mockRejectedValueOnce(new Error("private file path"))
    render(<UpdatesCard />)
    expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(true)
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not load update settings"
    )
  })
})
