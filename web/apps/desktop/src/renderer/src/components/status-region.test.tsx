// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { announce, StatusRegion } from "./status-region"

afterEach(cleanup)

it("says polite text in the status region and assertive text in the alert", () => {
  render(<StatusRegion />)

  act(() => announce("Link copied"))
  expect(screen.getByRole("status").textContent).toBe("Link copied")
  expect(screen.getByRole("alert").textContent).toBe("")

  act(() => announce("Someone wants to join.", "assertive"))
  expect(screen.getByRole("alert").textContent).toBe("Someone wants to join.")
  expect(screen.getByRole("status").textContent).toBe("")
})
