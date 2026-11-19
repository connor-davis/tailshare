// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { TransferState, TransferView } from "@/lib/api/types"
import { TransferRow } from "./transfer-row"

afterEach(cleanup)

function show(state: TransferState, error?: string) {
  const item: TransferView = {
    id: "t1",
    direction: "download",
    source: "pics/cat.png",
    destination: "cat.png",
    size: 100,
    bytes: 42,
    state,
    error,
  }

  render(
    <QueryClientProvider client={new QueryClient()}>
      <TransferRow item={item} onClear={() => undefined} />
    </QueryClientProvider>
  )
}

const buttons = () => screen.queryAllByRole("button").map((b) => b.textContent)

describe("TransferRow", () => {
  it.each([
    ["queued", ["Pause", "Cancel"]],
    ["starting", ["Pause", "Cancel"]],
    ["running", ["Pause", "Cancel"]],
    ["paused", ["Resume", "Cancel"]],
    ["failed", ["Retry", "Clear"]],
    ["done", ["Clear"]],
    ["canceled", ["Clear"]],
  ] as [TransferState, string[]][])("%s shows %j", (state, expected) => {
    show(state)

    expect(buttons()).toEqual(expected)
  })

  it("shows why a transfer failed, in words", () => {
    show("failed", "The other computer ran out of space.")

    expect(
      screen.getByText("Failed: The other computer ran out of space.")
    ).toBeTruthy()
  })

  it("labels the progress bar with the file name", () => {
    show("running")

    expect(screen.getByLabelText("cat.png progress")).toBeTruthy()
    expect(screen.getByText(/42%/)).toBeTruthy()
  })
})
