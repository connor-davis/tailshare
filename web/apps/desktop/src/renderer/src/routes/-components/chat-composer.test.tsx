// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ChatComposer } from "./chat-composer"

const mutate = vi.fn()
vi.mock("@/lib/api/chat", () => ({
  useSendChat: () => ({ mutate, isPending: false, error: null }),
}))

afterEach(() => {
  cleanup()
  mutate.mockClear()
})

const box = () => screen.getByLabelText("Message") as HTMLTextAreaElement

function type(text: string) {
  fireEvent.change(box(), { target: { value: text } })
}

describe("ChatComposer", () => {
  it("draws the frame with the input border so it is visible", () => {
    render(
      <ChatComposer
        connected
        busy={false}
        onAddFiles={() => {}}
        onPaste={() => {}}
      />
    )

    expect(box().closest(".rounded-2xl")?.className).toContain("border-input")
  })

  it("clears the box when the sent text is unchanged", () => {
    render(
      <ChatComposer
        connected
        busy={false}
        onAddFiles={() => {}}
        onPaste={() => {}}
      />
    )
    type("hello")
    fireEvent.click(screen.getByRole("button", { name: "Send" }))

    act(() => mutate.mock.calls[0]![1].onSuccess())

    expect(box().value).toBe("")
  })

  it("keeps what was typed while the send was pending", () => {
    render(
      <ChatComposer
        connected
        busy={false}
        onAddFiles={() => {}}
        onPaste={() => {}}
      />
    )
    type("hello")
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    type("hello again")

    act(() => mutate.mock.calls.at(-1)![1].onSuccess())

    expect(box().value).toBe("hello again")
  })
})
