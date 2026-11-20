// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TitleBar } from "./title-bar"

const bridge = {
  minimizeWindow: vi.fn(async () => {}),
  toggleMaximizeWindow: vi.fn(async () => {}),
  closeWindow: vi.fn(async () => {}),
}

beforeEach(() => {
  Object.assign(window, { tailshare: bridge })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("TitleBar", () => {
  it("shows the app name and three named buttons", () => {
    render(<TitleBar maximized={false} />)

    expect(screen.getByText("Tailshare")).toBeTruthy()
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))
    ).toEqual(["Minimize", "Maximize", "Close"])
  })

  it("calls the bridge once per button", () => {
    render(<TitleBar maximized={false} />)

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }))
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }))
    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    expect(bridge.minimizeWindow).toHaveBeenCalledOnce()
    expect(bridge.toggleMaximizeWindow).toHaveBeenCalledOnce()
    expect(bridge.closeWindow).toHaveBeenCalledOnce()
  })

  it("offers Restore when the window is maximised", () => {
    render(<TitleBar maximized />)

    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Maximize" })).toBeNull()
  })

  it("keeps every button out of the drag region", () => {
    render(<TitleBar maximized={false} />)

    for (const button of screen.getAllByRole("button"))
      expect(button.className).toContain("[-webkit-app-region:no-drag]")
    expect(screen.getByRole("banner").className).toContain(
      "[-webkit-app-region:drag]"
    )
  })
})
