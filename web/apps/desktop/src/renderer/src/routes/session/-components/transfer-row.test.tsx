// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { TransferState, TransferView } from "@/lib/api/types"
import { TransferRow } from "./transfer-row"

afterEach(cleanup)

function show(
  state: TransferState,
  error?: string,
  extra: Partial<TransferView> = {}
) {
  const item: TransferView = {
    id: "t1",
    direction: "download",
    source: "pics/cat.png",
    destination: "cat.png",
    size: 100,
    bytes: 42,
    state,
    error,
    ...extra,
  }

  render(
    <QueryClientProvider client={new QueryClient()}>
      <TransferRow item={item} />
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
    ["failed", ["Retry"]],
    ["done", []],
    ["canceled", []],
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

  it("counts down to the next try and hides Retry while it waits", () => {
    show("failed", "The other computer was busy.", {
      attempt: 1,
      retryAt: new Date(Date.now() + 30_000).toISOString(),
    })

    expect(screen.getByText(/Retrying in 3\d s \(try 2\)/)).toBeTruthy()
    expect(buttons()).toEqual([])
  })

  it("labels the progress bar with the file name", () => {
    show("running")

    expect(screen.getByLabelText("cat.png progress")).toBeTruthy()
    expect(screen.getByText(/42%/)).toBeTruthy()
  })
})

describe("TransferRow on a narrow room", () => {
  it("wraps its columns so the actions stay reachable", () => {
    show("running")

    const line = screen.getByText("cat.png").parentElement!
    expect(line.className).toContain("flex-wrap")
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy()
  })
})
