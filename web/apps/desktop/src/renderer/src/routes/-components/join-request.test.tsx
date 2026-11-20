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
import { apiFetch } from "@/lib/api/client"
import { keys } from "@/lib/api/keys"
import { JoinRequest } from "./join-request"

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function show() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <JoinRequest join={{ id: 7, displayName: "<script>Someone</script>" }} />
    </QueryClientProvider>
  )
  return client
}

describe("JoinRequest", () => {
  it.each(["Allow", "Deny"])(
    "sends %s for the displayed request and stores the new state",
    async (action) => {
      vi.mocked(apiFetch).mockResolvedValue({ state: "hosting" })
      const client = show()
      expect(screen.getByText("<script>Someone</script>")).toBeTruthy()
      expect(document.querySelector("script")).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: action }))
      await waitFor(() =>
        expect(apiFetch).toHaveBeenCalledWith(
          `/api/session/joins/7/${action.toLowerCase()}`,
          { method: "POST" }
        )
      )
      await waitFor(() =>
        expect(client.getQueryData(keys.session)).toEqual({ state: "hosting" })
      )
    }
  )

  it("disables both choices while waiting", async () => {
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}))
    show()
    fireEvent.click(screen.getByRole("button", { name: "Allow" }))
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Allowing…" }) as HTMLButtonElement)
          .disabled
      ).toBe(true)
    )
    expect(
      (screen.getByRole("button", { name: "Deny" }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })

  it("shows a failed decision inline", async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new Error("That join request is no longer waiting.")
    )
    show()
    fireEvent.click(screen.getByRole("button", { name: "Deny" }))
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "That join request is no longer waiting."
      )
    )
  })
})
