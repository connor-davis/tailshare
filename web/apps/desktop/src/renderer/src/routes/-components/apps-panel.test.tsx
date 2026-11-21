// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ForwardState } from "@/lib/api/types"
import { AppsPanel } from "./apps-panel"

const mocks = vi.hoisted(() => ({
  state: undefined as unknown,
  pending: false,
  share: vi.fn(),
  stop: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
}))

vi.mock("@/lib/api/forwards", () => {
  const mutation = (mutate: unknown) => () => ({
    mutate,
    isPending: false,
    error: null,
  })

  return {
    useForwards: () => ({
      data: mocks.state,
      error: null,
      isPending: mocks.pending,
    }),
    useShareApp: mutation(mocks.share),
    useStopApp: mutation(mocks.stop),
    useOpenApp: mutation(mocks.open),
    useCloseApp: mutation(mocks.close),
  }
})

const openForwardLink = vi.fn<(url: string) => Promise<void>>(async () => {})
const writeText = vi.fn(async () => {})

const app = (over = {}) => ({
  id: "a1",
  label: "Web",
  port: 8080,
  ownerId: "m1",
  ownerName: "Hana",
  open: false,
  ...over,
})
const state = (over: Partial<ForwardState> = {}): ForwardState => ({
  mine: [],
  others: [],
  unsupported: [],
  ...over,
})

beforeEach(() => {
  mocks.state = state()
  mocks.pending = false
  vi.clearAllMocks()
  vi.stubGlobal(
    "window",
    Object.assign(window, { tailshare: { openForwardLink } })
  )
  vi.stubGlobal("navigator", { clipboard: { writeText } })
})
afterEach(cleanup)

describe("AppsPanel", () => {
  it("says it is loading, then that nothing is shared", () => {
    mocks.state = undefined
    mocks.pending = true
    const { rerender } = render(<AppsPanel />)
    expect(screen.getByText("Loading apps…")).toBeTruthy()

    mocks.state = state()
    mocks.pending = false
    rerender(<AppsPanel />)
    expect(screen.getByText("No apps shared")).toBeTruthy()
  })

  it("stops my app and opens someone else's", () => {
    mocks.state = state({
      mine: [app({ id: "mine", label: "Mine", ownerName: "" })],
      others: [app()],
    })
    render(<AppsPanel />)

    fireEvent.click(screen.getByRole("button", { name: "Stop" }))
    expect(mocks.stop).toHaveBeenCalledWith("mine")

    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    expect(mocks.open).toHaveBeenCalledWith("a1")
  })

  it("shows the local address with Copy, Open in browser and Close", async () => {
    mocks.state = state({ others: [app({ open: true, localPort: 51234 })] })
    render(<AppsPanel />)

    expect(screen.getByText("127.0.0.1:51234")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /Copy/ }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("127.0.0.1:51234")
    )

    fireEvent.click(screen.getByRole("button", { name: /Open in browser/ }))
    expect(openForwardLink).toHaveBeenCalledExactlyOnceWith(
      "http://127.0.0.1:51234/"
    )

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(mocks.close).toHaveBeenCalledWith("a1")
  })

  it("names members whose build cannot share apps", () => {
    mocks.state = state({ unsupported: ["Old Laptop"] })
    render(<AppsPanel />)
    expect(screen.getByText(/Old Laptop/)).toBeTruthy()
  })

  it("shares a valid port and name, and refuses a bad port", () => {
    render(<AppsPanel />)
    fireEvent.click(screen.getByRole("button", { name: /Share an app/ }))

    const share = screen.getByRole("button", { name: "Share" })
    fireEvent.change(screen.getByLabelText("Port"), {
      target: { value: "70000" },
    })
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Dev" },
    })
    expect((share as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText("Port"), {
      target: { value: "3000" },
    })
    fireEvent.click(share)
    expect(mocks.share).toHaveBeenCalledWith(
      { port: 3000, label: "Dev" },
      expect.anything()
    )
  })
})
