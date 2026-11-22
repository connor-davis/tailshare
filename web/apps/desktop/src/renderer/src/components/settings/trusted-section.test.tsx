// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Settings } from "../../../../shared/bridge"
import type { SectionProps } from "./settings-fields"
import { TrustedSection } from "./trusted-section"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const KEY = `nodekey:${"a".repeat(64)}`

function show(trustedComputers: Settings["trustedComputers"]) {
  render(
    <TrustedSection
      {...({
        settings: { trustedComputers },
      } as unknown as SectionProps)}
    />
  )
}

describe("TrustedSection", () => {
  it("explains the empty list", () => {
    show([])

    expect(screen.getByText(/No trusted computers yet/)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("lists label, fingerprint and date, and removes by exact key", async () => {
    const revokeTrusted = vi.fn(async () => undefined)
    vi.stubGlobal("tailshare", { revokeTrusted })
    show([
      {
        key: KEY,
        label: "Pat's laptop",
        addedAt: 0,
        fingerprint: "a1b2c3d4e5f6",
      },
    ])

    expect(screen.getByText("Pat's laptop")).toBeTruthy()
    expect(screen.getByText("a1b2c3d4e5f6")).toBeTruthy()
    expect(screen.getByText(/Added/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Remove Pat's laptop" }))

    await waitFor(() => expect(revokeTrusted).toHaveBeenCalledWith(KEY))
  })

  it("shows a failed remove inline", async () => {
    vi.stubGlobal("tailshare", {
      revokeTrusted: vi.fn(async () => {
        throw new Error("Tailshare could not read that request.")
      }),
    })
    show([{ key: KEY, label: "Pat", addedAt: 0 }])

    fireEvent.click(screen.getByRole("button", { name: "Remove Pat" }))

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("could not read")
    )
  })
})
