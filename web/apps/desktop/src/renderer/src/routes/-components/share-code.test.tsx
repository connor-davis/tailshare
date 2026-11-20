// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ShareCode } from "./share-code"

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
  it("copies the bare code and the join link", async () => {
    render(<ShareCode code="7K3Q-9PXM" />)

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("7K3Q9PXM"))

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }))
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith("tailshare://join/7K3Q9PXM")
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
