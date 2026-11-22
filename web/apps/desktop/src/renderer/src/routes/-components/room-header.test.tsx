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
import { announce } from "@/components/status-region"
import { RoomHeader } from "./room-header"

const live = vi.hoisted(() => ({ value: "open" }))
vi.mock("@/lib/live/use-live", () => ({ useLiveStatus: () => live.value }))
vi.mock("@/components/status-region", () => ({ announce: vi.fn() }))

const openRoomFolder = vi.fn()

beforeEach(() => {
  live.value = "open"
  vi.mocked(announce).mockClear()
  vi.stubGlobal("tailshare", {
    openRoomFolder,
    getRecentRooms: async () => [],
    onRecentRoomsChanged: () => () => {},
  })
})
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

describe("RoomHeader live words", () => {
  const header = () => (
    <TooltipProvider>
      <RoomHeader
        peer={{ displayName: "Pat" }}
        onLeave={() => {}}
        leaving={false}
      />
    </TooltipProvider>
  )

  it("is silent on mount and speaks only when the link changes", () => {
    const view = render(header())
    expect(announce).not.toHaveBeenCalled()

    live.value = "reconnecting"
    view.rerender(header())
    expect(announce).toHaveBeenLastCalledWith("Reconnecting…")

    live.value = "open"
    view.rerender(header())
    expect(announce).toHaveBeenLastCalledWith("Connected.")
  })
})

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

describe("RoomHeader room save folder", () => {
  const header = () =>
    render(
      <TooltipProvider>
        <RoomHeader leaving={false} onLeave={() => {}} roomCode="7K3Q-9PXM" />
      </TooltipProvider>
    )

  it("picks a folder for this room and can go back to the default", async () => {
    const setRoomFolder = vi.fn(async () => {})
    vi.stubGlobal("tailshare", {
      openRoomFolder,
      chooseFolder: async () => "D:\\Pics",
      setRoomFolder,
      getRecentRooms: async () => [
        { name: "A", code: "7K3Q9PXM", lastSeen: 1, saveFolder: "D:\\Pics" },
      ],
      onRecentRoomsChanged: () => () => {},
    })
    header()

    fireEvent.click(
      await screen.findByRole("button", { name: /Saves to Pics/ })
    )
    await waitFor(() =>
      expect(setRoomFolder).toHaveBeenCalledWith({
        code: "7K3Q9PXM",
        folder: "D:\\Pics",
      })
    )

    fireEvent.click(screen.getByRole("button", { name: "Use my default" }))
    await waitFor(() =>
      expect(setRoomFolder).toHaveBeenLastCalledWith({
        code: "7K3Q9PXM",
        folder: null,
      })
    )
  })

  it("says so in plain words when the folder is refused", async () => {
    vi.stubGlobal("tailshare", {
      openRoomFolder,
      chooseFolder: async () => "D:\\Pics",
      setRoomFolder: async () => {
        throw new Error("no")
      },
      getRecentRooms: async () => [],
      onRecentRoomsChanged: () => () => {},
    })
    header()

    fireEvent.click(screen.getByRole("button", { name: "Room save folder" }))

    expect(await screen.findByRole("alert")).toBeTruthy()
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
