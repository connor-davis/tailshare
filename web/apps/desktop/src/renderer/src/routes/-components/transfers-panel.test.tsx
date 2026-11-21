// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { TransfersPanel } from "./transfers-panel"

const clear = vi.fn()
vi.mock("@/lib/api/transfers", () => ({
  useClearTransfers: () => ({ mutate: clear, isPending: false }),
  useTransfers: () => ({
    data: [
      { id: "a", source: "running.txt", state: "running" },
      { id: "b", source: "saved.txt", state: "done" },
    ],
  }),
}))
vi.mock("../session/-components/transfer-row", () => ({
  TransferRow: ({ item }: { item: { source: string } }) => (
    <li>{item.source}</li>
  ),
}))

afterEach(cleanup)

it("keeps counts and Clear inside the tile without a second heading or collapse", () => {
  render(<TransfersPanel />)
  expect(screen.getByText("1 active · 1 done")).toBeTruthy()
  expect(screen.queryByRole("heading", { name: "Transfers" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull()

  // Clear asks the sidecar; rows leave when its removed event arrives.
  fireEvent.click(screen.getByRole("button", { name: "Clear finished" }))
  expect(clear).toHaveBeenCalledTimes(1)
})
