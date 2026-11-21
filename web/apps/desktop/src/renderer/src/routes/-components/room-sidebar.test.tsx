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
import type { SessionState } from "@/lib/api/types"
import { RoomSidebar } from "./room-sidebar"

const openSettings = vi.fn()
vi.mock("@/components/settings/settings-dialog", () => ({
  useOpenSettings: () => openSettings,
}))

const updateSettings = vi.fn(async (patch: object) => ({
  displayName: "Studio PC",
  ...patch,
}))
const removeRecentRoom = vi.fn(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("tailshare", {
    getSettings: async () => ({ displayName: "Studio PC" }),
    updateSettings,
    onSettingsChanged: () => () => {},
    getRecentRooms: async () => [
      { name: "Pat's room", code: "7K3Q9PXM", lastSeen: Date.now() },
    ],
    onRecentRoomsChanged: () => () => {},
    removeRecentRoom,
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const idle: SessionState = { state: "idle" }
const connected: SessionState = {
  state: "connected",
  role: "joiner",
  peer: { displayName: "Pat", sharedFolderName: "Photos" },
  members: [
    { id: "a", displayName: "Pat", host: true },
    { id: "b", displayName: "Studio PC", you: true },
  ],
}

function show(session: SessionState) {
  const onNewRoom = vi.fn()
  const onJoin = vi.fn()
  const onRejoin = vi.fn()
  render(
    <TooltipProvider>
      <RoomSidebar
        session={session}
        busy={false}
        onNewRoom={onNewRoom}
        onJoin={onJoin}
        onRejoin={onRejoin}
      />
    </TooltipProvider>
  )

  return { onNewRoom, onJoin, onRejoin }
}

describe("RoomSidebar", () => {
  it("starts a room", () => {
    const { onNewRoom } = show(idle)

    fireEvent.click(screen.getByRole("button", { name: "New room" }))

    expect(onNewRoom).toHaveBeenCalledOnce()
  })

  it("shows the open room with its member count, and locks New room", () => {
    show(connected)

    expect(screen.getByText("Pat's room")).toBeTruthy()
    expect(screen.getByText("2")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "New room" }).hasAttribute("disabled")
    ).toBe(true)
    expect(
      screen.getByRole("button", { name: "Join room" }).hasAttribute("disabled")
    ).toBe(true)
  })

  it("shows the host's name for the room", () => {
    show({ ...connected, roomName: "Movie night" })

    expect(screen.getByText("Movie night")).toBeTruthy()
    expect(screen.queryByText("Pat's room")).toBeNull()
  })

  it("says so when a recent room cannot be forgotten", async () => {
    removeRecentRoom.mockRejectedValueOnce(new Error("disk"))
    show(idle)

    fireEvent.click(
      await screen.findByRole("button", { name: "Forget Pat's room" })
    )

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not forget that room. Try again."
    )
  })

  it("opens the Join dialog and joins with a pasted link", () => {
    const { onJoin } = show(idle)

    fireEvent.click(screen.getByRole("button", { name: "Join room" }))
    fireEvent.change(screen.getByLabelText("Join with a code or link"), {
      target: { value: "tailshare://join/7K3Q9PXM" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Join" }))

    expect(onJoin).toHaveBeenCalledWith("7K3Q9PXM")
  })

  it("rejoins a recent room from its row, and forgets it", async () => {
    const { onRejoin } = show(idle)

    fireEvent.click(
      await screen.findByRole("button", { name: "Rejoin Pat's room" })
    )
    expect(onRejoin).toHaveBeenCalledWith("7K3Q9PXM")

    fireEvent.click(screen.getByRole("button", { name: "Forget Pat's room" }))
    expect(removeRecentRoom).toHaveBeenCalledWith("7K3Q9PXM")
  })

  it("has a full-width New room button and a search box", () => {
    show(idle)

    expect(screen.getByRole("button", { name: "New room" })).toBeTruthy()
    expect(
      (screen.getByLabelText("Search rooms") as HTMLInputElement).placeholder
    ).toBe("Search rooms")
  })

  it("filters recent rooms by name or code as you type", async () => {
    show(idle)
    await screen.findByRole("button", { name: "Rejoin Pat's room" })

    fireEvent.change(screen.getByLabelText("Search rooms"), {
      target: { value: "7k3q" },
    })
    expect(
      screen.getByRole("button", { name: "Rejoin Pat's room" })
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Search rooms"), {
      target: { value: "zzz" },
    })
    expect(
      screen.queryByRole("button", { name: "Rejoin Pat's room" })
    ).toBeNull()
    expect(screen.getByText("No rooms match")).toBeTruthy()
  })

  it("filters the open room too", () => {
    show(connected)

    fireEvent.change(screen.getByLabelText("Search rooms"), {
      target: { value: "nothing" },
    })

    expect(screen.queryByText("Pat's room")).toBeNull()
  })

  it("clears the search on Escape and focuses it with Ctrl+K", () => {
    show(idle)
    const box = screen.getByLabelText("Search rooms") as HTMLInputElement

    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    expect(document.activeElement).toBe(box)

    fireEvent.change(box, { target: { value: "abc" } })
    fireEvent.keyDown(box, { key: "Escape" })
    expect(box.value).toBe("")
  })

  it("opens settings from the gear", () => {
    show(idle)

    fireEvent.click(screen.getByRole("button", { name: "Settings" }))

    expect(openSettings).toHaveBeenCalledOnce()
  })

  it("saves an edited name on Enter and on blur", async () => {
    show(idle)

    fireEvent.click(
      await screen.findByRole("button", { name: /Display name: Studio PC/ })
    )
    const field = screen.getByLabelText("Display name")
    fireEvent.change(field, { target: { value: "Laptop" } })
    fireEvent.keyDown(field, { key: "Enter" })
    await waitFor(() =>
      expect(updateSettings).toHaveBeenLastCalledWith({ displayName: "Laptop" })
    )

    fireEvent.click(await screen.findByRole("button", { name: /Display name/ }))
    const again = screen.getByLabelText("Display name")
    fireEvent.change(again, { target: { value: "Desk" } })
    fireEvent.blur(again)
    await waitFor(() =>
      expect(updateSettings).toHaveBeenLastCalledWith({ displayName: "Desk" })
    )
  })

  it("cancels a name edit on Escape", async () => {
    show(idle)

    fireEvent.click(
      await screen.findByRole("button", { name: /Display name: Studio PC/ })
    )
    const field = screen.getByLabelText("Display name")
    fireEvent.change(field, { target: { value: "Nope" } })
    fireEvent.keyDown(field, { key: "Escape" })
    fireEvent.blur(field)

    expect(updateSettings).not.toHaveBeenCalled()
    expect(screen.queryByLabelText("Display name")).toBeNull()
  })

  it("shows a plain sentence when the name is refused", async () => {
    updateSettings.mockRejectedValueOnce(new Error("bad"))
    show(idle)

    fireEvent.click(
      await screen.findByRole("button", { name: /Display name: Studio PC/ })
    )
    const field = screen.getByLabelText("Display name")
    fireEvent.change(field, { target: { value: "Laptop" } })
    fireEvent.keyDown(field, { key: "Enter" })

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Could not save that/
    )
  })
})
