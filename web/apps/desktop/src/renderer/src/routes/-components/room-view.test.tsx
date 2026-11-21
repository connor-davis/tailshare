// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { RoomView } from "./room-view"

vi.mock("./room-header", () => ({
  RoomHeader: () => <header>Room header</header>,
}))
vi.mock("./room-chat", () => ({
  RoomChat: () => <textarea aria-label="Draft" />,
}))
vi.mock("./room-files", () => ({ RoomFiles: () => <p>File collection</p> }))
vi.mock("./members-panel", () => ({ MembersPanel: () => <p>Live roster</p> }))
vi.mock("./apps-panel", () => ({ AppsPanel: () => <p>Shared apps</p> }))
vi.mock("./transfers-panel", () => ({
  TransfersPanel: () => <p>Transfer queue</p>,
}))

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

it.each(["Files", "People", "Chat", "Transfers", "Apps"])(
  "expands %s and returns without remounting the draft",
  (name) => {
    render(
      <RoomView
        session={{ state: "hosting" }}
        onLeave={vi.fn()}
        leaving={false}
      />
    )
    const draft = screen.getByLabelText("Draft") as HTMLTextAreaElement
    fireEvent.change(draft, { target: { value: "Keep this message" } })
    const expand = screen.getByRole("button", { name: `Expand ${name}` })
    expand.focus()
    fireEvent.click(expand)

    const back = screen.getByRole("button", { name: "Return to room board" })
    expect(back.getAttribute("aria-expanded")).toBe("true")
    expect(document.activeElement).toBe(back)
    expect(
      screen.queryByRole("button", {
        name: `Expand ${name === "Files" ? "Chat" : "Files"}`,
      })
    ).toBeNull()
    expect(draft.isConnected).toBe(true)

    fireEvent.click(back)
    expect(screen.getByLabelText("Draft")).toBe(draft)
    expect(draft.value).toBe("Keep this message")
    expect(screen.getAllByRole("button", { name: /^Expand / })).toHaveLength(5)
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: `Expand ${name}` })
    )
  }
)

it("exposes a join request while a different tile is expanded", () => {
  render(
    <RoomView
      session={{
        state: "hosting",
        role: "host",
        join: { id: 2, displayName: "Pat" },
      }}
      onLeave={vi.fn()}
      leaving={false}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: "Expand Chat" }))
  fireEvent.click(screen.getByRole("button", { name: "Review join request" }))
  expect(screen.getByText("Live roster")).toBeTruthy()
  expect(
    screen
      .getByText("Live roster")
      .closest("[data-slot=card]")
      ?.hasAttribute("hidden")
  ).toBe(false)
  expect(
    screen
      .getByText("File collection")
      .closest("[data-slot=card]")
      ?.hasAttribute("hidden")
  ).toBe(true)
})
