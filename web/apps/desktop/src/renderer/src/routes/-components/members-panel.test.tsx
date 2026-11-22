// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { apiFetch } from "@/lib/api/client"
import type { SessionState } from "@/lib/api/types"
import { announce } from "@/components/status-region"
import { MembersPanel } from "./members-panel"

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }))
vi.mock("@/components/status-region", () => ({ announce: vi.fn() }))
vi.mock("./join-request", () => ({
  JoinRequest: () => <p>request shown</p>,
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const base: SessionState = {
  state: "connected",
  role: "host",
  members: [
    { id: "a", displayName: "Studio", host: true, you: true },
    { id: "b", displayName: "Laptop", fingerprint: "a1b2c3d4e5f6" },
  ],
}

function wrap(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })

  return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

function show(session: SessionState) {
  return render(wrap(<MembersPanel session={session} />))
}

describe("MembersPanel", () => {
  it("says You (host) on your own host row", () => {
    show(base)

    expect(screen.getByText("You (host)")).toBeTruthy()
    expect(screen.getByText("Laptop")).toBeTruthy()
  })

  it("marks someone else's host row with the word Host", () => {
    show({
      ...base,
      role: "joiner",
      members: [
        { id: "a", displayName: "Studio", host: true },
        { id: "b", displayName: "Laptop", you: true },
      ],
    })

    expect(screen.getByText("Host")).toBeTruthy()
    expect(screen.getByText("You")).toBeTruthy()
  })

  it("shows the join request only to the host", () => {
    const join = { id: 1, displayName: "Pat" }
    const { rerender } = show({ ...base, join })
    expect(screen.getByText("request shown")).toBeTruthy()

    rerender(wrap(<MembersPanel session={{ ...base, role: "joiner", join }} />))
    expect(screen.queryByText("request shown")).toBeNull()
  })

  it("shows each member's fingerprint in monospace", () => {
    show(base)

    const print = screen.getByText("a1b2c3d4e5f6")
    expect(print.className).toContain("font-mono")
    expect(print.className).toContain("text-muted-foreground")
  })

  it("offers Remove only to the host, and only for someone else", () => {
    const { rerender } = show(base)
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Remove Laptop" })).toBeTruthy()

    rerender(
      wrap(
        <MembersPanel
          session={{
            ...base,
            role: "joiner",
            members: [
              { id: "a", displayName: "Studio", host: true },
              { id: "b", displayName: "Laptop", you: true },
              { id: "c", displayName: "Pat" },
            ],
          }}
        />
      )
    )
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull()
  })

  it("asks first, then removes the member and closes", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ state: "connected" })
    show(base)

    fireEvent.click(screen.getByRole("button", { name: "Remove Laptop" }))
    expect(screen.getByText("Remove Laptop?")).toBeTruthy()
    expect(apiFetch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/session/members/b", {
        method: "DELETE",
      })
    )
    await waitFor(() => expect(screen.queryByText("Remove Laptop?")).toBeNull())
    expect(announce).toHaveBeenCalledWith("Laptop was removed.")
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("list", { name: "Members list" })
      )
    )
  })

  it("keeps Cancel from removing anyone", () => {
    show(base)

    fireEvent.click(screen.getByRole("button", { name: "Remove Laptop" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(apiFetch).not.toHaveBeenCalled()
    expect(screen.queryByText("Remove Laptop?")).toBeNull()
  })

  it("shows a refused removal in the dialog and keeps it open", async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new Error("Only the first member can remove someone.")
    )
    show(base)

    fireEvent.click(screen.getByRole("button", { name: "Remove Laptop" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Only the first member can remove someone."
      )
    )
    expect(screen.getByText("Remove Laptop?")).toBeTruthy()
  })
})

it("shows observed paths as words and leaves unknown paths unlabelled", () => {
  show({
    ...base,
    members: [
      { id: "direct", displayName: "Direct peer", path: { kind: "direct" } },
      {
        id: "relay",
        displayName: "Relayed peer",
        path: { kind: "relay", region: "FRA" },
      },
      { id: "unknown", displayName: "Unknown peer", path: { kind: "unknown" } },
    ],
  })
  expect(screen.getByText("Direct")).toBeTruthy()
  expect(screen.getByText("Relay · FRA")).toBeTruthy()
  expect(screen.queryByText("Unknown")).toBeNull()
})
