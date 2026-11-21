// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { HomeBoard } from "./home-board"

const remove = vi.fn(async () => {})
const join = vi.fn()
const open = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("tailshare", {
    getRecentRooms: async () => [
      { name: "Studio", code: "7K3Q9PXM", lastSeen: Date.now() },
    ],
    onRecentRoomsChanged: () => () => {},
    removeRecentRoom: remove,
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("filters saved cards and uses their real Rejoin and Forget actions", async () => {
  render(
    <HomeBoard
      session={{ state: "idle" }}
      busy={false}
      onCreate={vi.fn()}
      onJoin={join}
      onOpenRoom={open}
    />
  )
  const card = await screen.findByLabelText("Saved room: Studio")
  expect(within(card).queryByText(/seats/)).toBeNull()
  expect(within(card).queryByText(/Closed|Live/)).toBeNull()

  fireEvent.click(within(card).getByRole("button", { name: "Rejoin Studio" }))
  expect(join).toHaveBeenCalledWith("7K3Q9PXM")
  fireEvent.click(within(card).getByRole("button", { name: "Forget Studio" }))
  expect(remove).toHaveBeenCalledWith("7K3Q9PXM")

  fireEvent.change(screen.getByLabelText("Search home rooms"), {
    target: { value: "missing" },
  })
  expect(screen.queryByLabelText("Saved room: Studio")).toBeNull()
  expect(screen.getByText(/No rooms match/)).toBeTruthy()
})

it("shows actual live seats and opens the room without joining again", async () => {
  render(
    <HomeBoard
      session={{
        state: "hosting",
        roomName: "Design",
        members: [{ id: "a", displayName: "You", you: true }],
      }}
      busy={false}
      onCreate={vi.fn()}
      onJoin={join}
      onOpenRoom={open}
    />
  )
  expect(screen.getByText("1 of 8 seats")).toBeTruthy()
  expect(
    screen.getByText("Leave this room first to create or join another.")
  ).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Open room" }))
  expect(open).toHaveBeenCalledOnce()
  expect(
    (await screen.findByRole("button", { name: "Rejoin Studio" })).hasAttribute(
      "disabled"
    )
  ).toBe(true)
  expect(
    screen.getByText("Leave this room first to rejoin another.")
  ).toBeTruthy()
})

it("keeps a failed Forget visible with a recovery sentence", async () => {
  remove.mockRejectedValueOnce(new Error("disk"))
  render(
    <HomeBoard
      session={{ state: "idle" }}
      busy={false}
      onCreate={vi.fn()}
      onJoin={join}
      onOpenRoom={open}
    />
  )
  fireEvent.click(await screen.findByRole("button", { name: "Forget Studio" }))
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Could not forget that room. Try again."
  )
})
