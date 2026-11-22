// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { TransferState, TransferView } from "@/lib/api/types"
import { TransferRow } from "./transfer-row"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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

describe("TransferRow drag out", () => {
  const bridge = (can: boolean) => {
    const startFileDrag = vi.fn(async () => {})
    vi.stubGlobal("tailshare", { canDragFile: async () => can, startFileDrag })
    return startFileDrag
  }
  const row = () => screen.getByRole("listitem")

  it("can be dragged out once finished, and starts one drag", async () => {
    const startFileDrag = bridge(true)
    show("done")

    await waitFor(() => expect(row().getAttribute("draggable")).toBe("true"))
    fireEvent.dragStart(row())

    expect(startFileDrag).toHaveBeenCalledTimes(1)
    expect(startFileDrag).toHaveBeenCalledWith("t1")
  })

  it("is not draggable when main does not know the file", async () => {
    bridge(false)
    show("done")

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(row().getAttribute("draggable")).toBeNull()
  })

  it("is not draggable while running or for an upload", async () => {
    bridge(true)
    show("running")
    show("done", undefined, { direction: "upload" })

    await new Promise((resolve) => setTimeout(resolve, 20))

    for (const li of screen.getAllByRole("listitem"))
      expect(li.getAttribute("draggable")).toBeNull()
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
