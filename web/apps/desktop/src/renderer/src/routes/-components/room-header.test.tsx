// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RoomHeader } from "./room-header"

vi.mock("@/lib/live/use-live", () => ({ useLiveStatus: () => "open" }))

const openRoomFolder = vi.fn()

beforeEach(() => vi.stubGlobal("tailshare", { openRoomFolder }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  openRoomFolder.mockReset()
})

function show() {
  render(
    <TooltipProvider>
      <RoomHeader
        peer={{ displayName: "Pat" }}
        onLeave={() => {}}
        leaving={false}
        roomCode="7K3Q9PXM"
      />
    </TooltipProvider>
  )
}

describe("RoomHeader Open folder", () => {
  it("says so when the folder cannot be opened, and clears on retry", async () => {
    openRoomFolder.mockRejectedValueOnce(new Error("no"))
    openRoomFolder.mockResolvedValueOnce(undefined)
    show()

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not open the room folder. Try again."
    )

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })
})
