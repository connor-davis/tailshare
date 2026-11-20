// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SidecarBanner } from "./sidecar-banner"

afterEach(cleanup)

describe("SidecarBanner", () => {
  it("says nothing while the engine is fine", () => {
    const { container } = render(<SidecarBanner status="ready" error={null} />)

    expect(container.firstChild).toBeNull()
  })

  it("is an alert when the engine stopped", () => {
    render(<SidecarBanner status="failed" error={null} />)

    expect(screen.getByRole("alert").textContent).toContain("engine stopped")
  })

  it("is an alert for a connection error", () => {
    render(<SidecarBanner status="ready" error="Could not connect." />)

    expect(screen.getByRole("alert").textContent).toBe("Could not connect.")
  })

  it("is a calm status while reconnecting", () => {
    render(<SidecarBanner status="restarting" error={null} />)

    expect(screen.getByRole("status").textContent).toContain("Reconnecting")
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
