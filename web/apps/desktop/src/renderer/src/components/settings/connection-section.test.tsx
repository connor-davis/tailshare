// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Settings } from "../../../../shared/bridge"
import { apiFetch } from "@/lib/api/client"
import { ConnectionSection } from "./connection-section"

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
const settings: Settings = {
  language: "en",
  relayRegion: "303",
  updateChannel: "latest",
  displayName: "PC",
  saveMode: "folder",
  saveFolder: "C:/Downloads",
  uploadLimitKiB: 0,
  downloadLimitKiB: 0,
  transfersAtOnce: 2,
  startWithWindows: false,
  explorerMenu: true,
  closeToTray: false,
  notifications: true,
  mica: true,
  theme: "system",
  trustedComputers: [],
}

function show() {
  const save = vi.fn(async () => true)
  render(
    <ConnectionSection
      settings={settings}
      save={save}
      saving={false}
      error=""
      fail={vi.fn()}
    />
  )
  return save
}
describe("Connection section", () => {
  it("tests only on request, shows progress and then readable facts", async () => {
    let finish: (value: unknown) => void = () => {}
    vi.mocked(apiFetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    show()
    expect(screen.getByText(/outside FRA/)).toBeTruthy()
    expect(apiFetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Test my connection" }))
    expect(
      screen.getByText("Checking UDP and relay reachability…")
    ).toBeTruthy()
    expect(
      screen
        .getByRole("button", { name: "Testing connection…" })
        .hasAttribute("disabled")
    ).toBe(true)
    finish({
      udp: false,
      ipv4: true,
      ipv6: false,
      nearest: "FRA",
      captivePortal: "unknown",
      regions: [
        { region: "FRA", milliseconds: 12 },
        { region: "TOK", milliseconds: null },
      ],
      hints: ["UDP may be blocked, so files go through a relay."],
    })
    await screen.findByText("FRA: 12 ms")
    expect(screen.getByText("TOK: No response")).toBeTruthy()
    expect(screen.getByText("UDP: No response")).toBeTruthy()
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith("/api/connection/test", {
      method: "POST",
    })
  })
  it("shows a retryable plain error", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("private probe detail"))
    show()
    fireEvent.click(screen.getByRole("button", { name: "Test my connection" }))
    await screen.findByText(
      "Could not test this connection. Check your network and try again."
    )
    expect(screen.queryByText("private probe detail")).toBeNull()
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Test my connection" })
          .hasAttribute("disabled")
      ).toBe(false)
    )
  })
  it("saves a region immediately", async () => {
    const save = show()
    fireEvent.click(screen.getByRole("combobox", { name: "Relay region" }))
    fireEvent.click(await screen.findByRole("option", { name: "Nearest" }))
    expect(save).toHaveBeenCalledWith({ relayRegion: "nearest" })
  })
})
