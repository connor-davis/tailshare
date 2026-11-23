// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { announce } from "@/components/status-region"
import { ShareCode } from "./share-code"

vi.mock("@/components/status-region", () => ({ announce: vi.fn() }))

const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("navigator", { clipboard: { writeText } })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("ShareCode", () => {
  it("opens a QR dialog with the written share code", () => {
    render(<ShareCode code="7K3Q-9PXM" compact />)

    fireEvent.click(screen.getByRole("button", { name: "Show QR" }))

    const dialog = screen.getByRole("dialog", { name: "Join by QR" })
    const qr = within(dialog).getByRole("img", { name: "Room code QR" })
    expect(qr.tagName.toLowerCase()).toBe("svg")
    expect(qr.querySelectorAll("path").length).toBeGreaterThan(0)
    expect(within(dialog).getByText("7K3Q-9PXM")).toBeDefined()
    expect(
      within(dialog).getByText("Scan this with the Tailshare phone app.")
    ).toBeDefined()
  })

  it("copies the bare code and the join link", async () => {
    render(<ShareCode code="7K3Q-9PXM" />)

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("7K3Q9PXM"))

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }))
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith("tailshare://join/7K3Q9PXM")
    )
  })

  it("says which of the two was copied", async () => {
    render(<ShareCode code="7K3Q-9PXM" />)

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }))
    await waitFor(() =>
      expect(announce).toHaveBeenLastCalledWith("Link copied")
    )

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }))
    await waitFor(() =>
      expect(announce).toHaveBeenLastCalledWith("Code copied")
    )
  })

  it("says so in plain words when the copy fails", async () => {
    writeText.mockRejectedValueOnce(new Error("no"))
    render(<ShareCode code="7K3Q9PXM" compact />)

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }))

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Could not copy/
    )
  })
})
