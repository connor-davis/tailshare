// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { applyEvent } from "../live/apply"
import { apiFetch } from "./client"
import { keys } from "./keys"
import { useHost } from "./session"
import type { SessionState } from "./types"

vi.mock("./client", () => ({ apiFetch: vi.fn() }))

describe("session calls", () => {
  it("drops a reply that the socket has already overtaken", async () => {
    const client = new QueryClient()
    let reply: (state: SessionState) => void = () => {}
    vi.mocked(apiFetch).mockReturnValue(
      new Promise<SessionState>((resolve) => (reply = resolve))
    )
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useHost("Studio"), { wrapper })

    act(() => result.current.mutate(undefined))
    applyEvent(client, {
      seq: 1,
      type: "session.state",
      data: { state: "connected", role: "host" },
    })
    await act(async () => reply({ state: "hosting", role: "host" }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(client.getQueryData<SessionState>(keys.session)?.state).toBe(
      "connected"
    )
  })
})
