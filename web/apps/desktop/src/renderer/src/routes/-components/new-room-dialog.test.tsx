// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NewRoomDialog } from "./new-room-dialog"

afterEach(cleanup)

function show(busy = false) {
  const onCreate = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <NewRoomDialog
      open
      onOpenChange={onOpenChange}
      defaultName="Hana's room"
      busy={busy}
      onCreate={onCreate}
    />
  )

  return { onCreate, onOpenChange }
}

const box = () => screen.getByLabelText("Room name") as HTMLInputElement

describe("NewRoomDialog", () => {
  it("starts with the default name", () => {
    show()

    expect(box().value).toBe("Hana's room")
  })

  it("creates with the typed name, trimmed", () => {
    const { onCreate, onOpenChange } = show()

    fireEvent.change(box(), { target: { value: "  Movie night  " } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    expect(onCreate).toHaveBeenCalledWith("Movie night")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("uses the default name when the box is blank", () => {
    const { onCreate } = show()

    fireEvent.change(box(), { target: { value: "   " } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    expect(onCreate).toHaveBeenCalledWith("Hana's room")
  })

  it("submits on Enter", () => {
    const { onCreate } = show()

    fireEvent.submit(box().closest("form") as HTMLFormElement)

    expect(onCreate).toHaveBeenCalledWith("Hana's room")
  })

  it("cancels without creating", () => {
    const { onCreate, onOpenChange } = show()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("does not create twice while busy", () => {
    const { onCreate } = show(true)

    fireEvent.submit(box().closest("form") as HTMLFormElement)

    expect(onCreate).not.toHaveBeenCalled()
  })
})
