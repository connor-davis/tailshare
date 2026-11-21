// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { TransfersPanel } from "./transfers-panel"

vi.mock("@/lib/api/transfers", () => ({
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

  fireEvent.click(screen.getByRole("button", { name: "Clear finished" }))
  expect(screen.queryByText("saved.txt")).toBeNull()
  expect(screen.getByText("running.txt")).toBeTruthy()
  expect(screen.getByText("1 active")).toBeTruthy()
})
