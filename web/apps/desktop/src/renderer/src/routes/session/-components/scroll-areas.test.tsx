// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RoomChat } from "../../-components/room-chat"
import { RowMenu } from "./row-menu"

const messages = Array.from({ length: 30 }, (_, index) => ({
  id: `m${index}`,
  fromPeer: index % 2 === 0,
  text: `message ${index}`,
  time: "2026-11-20T10:00:00Z",
}))

vi.mock("@/lib/api/chat", () => ({
  useChat: () => ({ data: messages, error: null }),
  useSendChat: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("scroll areas", () => {
  it("scrolls a long file list inside a ScrollArea, not a native container", () => {
    const { container } = render(
      <RowMenu
        onContext={() => {}}
        onOpen={() => {}}
        onSend={() => {}}
        onSelectAll={() => {}}
        onRefresh={() => {}}
      >
        {Array.from({ length: 50 }, (_, index) => (
          <p key={index}>row {index}</p>
        ))}
      </RowMenu>
    )

    expect(
      container.querySelector('[data-slot="scroll-area-viewport"]')
    ).toBeTruthy()
    expect(container.querySelector(".overflow-auto")).toBeNull()
  })

  it("keeps the newest chat message in view by scrolling the viewport", () => {
    const scrollTo = vi.spyOn(Element.prototype, "scrollTo")
    render(<RoomChat />)

    const log = screen.getByRole("log", { name: "Chat messages" })
    const viewport = log.querySelector('[data-slot="scroll-area-viewport"]')

    expect(viewport).toBeTruthy()
    // The call must land on the viewport; on the root it would scroll nothing.
    expect(scrollTo.mock.contexts).toContain(viewport)
    expect(log.querySelector(".overflow-auto")).toBeNull()
  })
})
