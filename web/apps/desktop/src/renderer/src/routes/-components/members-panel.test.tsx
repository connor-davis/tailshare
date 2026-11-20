// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { SessionState } from "@/lib/api/types"
import { MembersPanel } from "./members-panel"

vi.mock("./join-request", () => ({
  JoinRequest: () => <p>request shown</p>,
}))

afterEach(cleanup)

const base: SessionState = {
  state: "connected",
  role: "host",
  members: [
    { id: "a", displayName: "Studio", host: true, you: true },
    { id: "b", displayName: "Laptop" },
  ],
}

describe("MembersPanel", () => {
  it("says You (host) on your own host row", () => {
    render(<MembersPanel session={base} />)

    expect(screen.getByText("You (host)")).toBeTruthy()
    expect(screen.getByText("Laptop")).toBeTruthy()
  })

  it("marks someone else's host row with the word Host", () => {
    render(
      <MembersPanel
        session={{
          ...base,
          role: "joiner",
          members: [
            { id: "a", displayName: "Studio", host: true },
            { id: "b", displayName: "Laptop", you: true },
          ],
        }}
      />
    )

    expect(screen.getByText("Host")).toBeTruthy()
    expect(screen.getByText("You")).toBeTruthy()
  })

  it("shows the join request only to the host", () => {
    const join = { id: 1, displayName: "Pat" }
    const { rerender } = render(<MembersPanel session={{ ...base, join }} />)
    expect(screen.getByText("request shown")).toBeTruthy()

    rerender(<MembersPanel session={{ ...base, role: "joiner", join }} />)
    expect(screen.queryByText("request shown")).toBeNull()
  })
})
