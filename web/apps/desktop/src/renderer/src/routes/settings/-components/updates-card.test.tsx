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
import type {
  Settings,
  TailshareBridge,
  UpdateStatus,
} from "../../../../../shared/bridge"
import { UpdatesCard } from "./updates-card"

const stable = { updateChannel: "latest" } as Settings
const nightly = { updateChannel: "nightly" } as Settings

let listener: (status: UpdateStatus) => void
const unsubscribe = vi.fn()
const getUpdateStatus = vi.fn(async () => ({ state: "current" }))
const restartToUpdate = vi.fn(async () => {})
const save = vi.fn(async () => true)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("tailshare", {
    getUpdateStatus,
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
  it("shows Stable and saves a change to Nightly", async () => {
    render(<UpdatesCard settings={stable} save={save} saving={false} />)
    await screen.findByText("No update available.")
    const select = screen.getByRole("combobox", { name: "Release channel" })
    expect(select.textContent).toContain("Stable")
    fireEvent.keyDown(select, { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("option", { name: "Nightly" }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ updateChannel: "nightly" })
    )
  })

  it("explains Nightly when it is chosen", async () => {
    render(<UpdatesCard settings={nightly} save={save} saving={false} />)
    await screen.findByText(
      "Nightly follows development builds only. Changes may be unfinished."
    )
  })

  it("disables the channel while a save runs", () => {
    render(<UpdatesCard settings={stable} save={save} saving />)
    expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(true)
  })

  it("shows pushed progress and restart readiness and unsubscribes", async () => {
    const view = render(
      <UpdatesCard settings={stable} save={save} saving={false} />
    )
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
    render(<UpdatesCard settings={stable} save={save} saving={false} />)
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

  it("handles a status failure without exposing internal details", async () => {
    getUpdateStatus.mockRejectedValueOnce(new Error("private file path"))
    render(<UpdatesCard settings={stable} save={save} saving={false} />)
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not check for updates"
    )
  })
})
