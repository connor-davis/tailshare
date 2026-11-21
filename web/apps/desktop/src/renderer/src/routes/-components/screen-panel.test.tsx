// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScreenPanel } from "./screen-panel"
import type { ScreenState } from "@/lib/api/types"

const mocks = vi.hoisted(() => ({ play: vi.fn(() => vi.fn()) }))
vi.mock("@/lib/media/screen-player", () => ({ playScreen: mocks.play }))
const empty: ScreenState = { mine: [], others: [], unsupported: [] }
const item = {
  id: "share",
  codec: "video/webm;codecs=vp8",
  ownerId: "hana",
  ownerName: "Hana",
  viewers: 2,
}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("Screen panel", () => {
  it("shows loading, error, empty and unsupported states", () => {
    const view = render(<ScreenPanel loading busy={false} onShare={vi.fn()} />)
    expect(screen.getByText("Loading screens…")).toBeTruthy()
    view.rerender(
      <ScreenPanel
        state={empty}
        loading={false}
        busy={false}
        onShare={vi.fn()}
      />
    )
    expect(screen.getByText("No screens to watch")).toBeTruthy()
    view.rerender(
      <ScreenPanel
        state={{ ...empty, unsupported: ["Old"] }}
        error="Could not load screens."
        loading={false}
        busy={false}
        onShare={vi.fn()}
      />
    )
    expect(screen.getByText("Could not load screens.")).toBeTruthy()
    expect(
      screen.getByText(/this build cannot watch or share screens/)
    ).toBeTruthy()
  })
  it("asks for a source and shares only the explicitly selected opaque ID", async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal("tailshare", {
      screenSources: async () => [
        {
          id: "opaque",
          name: "Window",
          thumbnail: "data:image/png;base64,AA==",
        },
      ],
    })
    render(
      <ScreenPanel state={empty} loading={false} busy={false} onShare={share} />
    )
    fireEvent.click(screen.getByRole("button", { name: "Share screen" }))
    expect(await screen.findByText("Experimental")).toBeTruthy()
    expect(
      screen.getByText("Screen sharing is experimental. It may lag or stop.")
    ).toBeTruthy()
    fireEvent.click(await screen.findByRole("button", { name: "Window" }))
    expect(share).toHaveBeenCalledWith("opaque")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
  it("shows viewer count for my share and starts and stops another member's video", () => {
    const state = { ...empty, mine: [{ ...item, id: "mine" }], others: [item] }
    const view = render(
      <ScreenPanel
        state={state}
        loading={false}
        busy={false}
        onShare={vi.fn()}
      />
    )
    expect(
      screen.getByText(/You are sharing your screen · 2 viewers/)
    ).toBeTruthy()
    expect(
      (
        screen.getByRole("button", {
          name: "Share screen",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Watch" }))
    expect(screen.getByText("Live")).toBeTruthy()
    expect(mocks.play).toHaveBeenCalledOnce()
    view.rerender(
      <ScreenPanel
        state={empty}
        loading={false}
        busy={false}
        onShare={vi.fn()}
      />
    )
    expect(screen.queryByText("Live")).toBeNull()
    expect(mocks.play.mock.results[0]!.value).toHaveBeenCalledOnce()
  })
})
