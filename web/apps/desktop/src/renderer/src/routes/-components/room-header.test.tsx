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

function show(
  props: { host?: boolean; peer?: boolean; onLeave?: () => void } = {}
) {
  render(
    <TooltipProvider>
      <RoomHeader
        peer={props.peer === false ? undefined : { displayName: "Pat" }}
        host={props.host}
        onLeave={props.onLeave ?? (() => {})}
        leaving={false}
        roomCode="7K3Q9PXM"
      />
    </TooltipProvider>
  )
}

describe("RoomHeader Leave", () => {
  it("asks the host before ending the room for everyone", () => {
    const onLeave = vi.fn()
    show({ host: true, onLeave })

    fireEvent.click(screen.getByRole("button", { name: "Leave" }))
    expect(screen.getByText("End this room for everyone?")).toBeTruthy()
    expect(onLeave).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "End room" }))
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it("asks a joiner with simpler words, and Cancel leaves nothing", () => {
    const onLeave = vi.fn()
    show({ onLeave })

    fireEvent.click(screen.getByRole("button", { name: "Leave" }))
    expect(screen.getByText("Leave this room?")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onLeave).not.toHaveBeenCalled()
    expect(screen.queryByText("Leave this room?")).toBeNull()
  })

  it("cancels a room nobody has joined without asking", () => {
    const onLeave = vi.fn()
    show({ host: true, peer: false, onLeave })

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onLeave).toHaveBeenCalledOnce()
  })
})

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
