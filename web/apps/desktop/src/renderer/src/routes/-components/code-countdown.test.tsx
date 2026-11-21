// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { CodeCountdown } from "./code-countdown"

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it("counts down from the sidecar's end time, so a reload shows the same", () => {
  const end = new Date(Date.now() + 90_000).toISOString()
  render(<CodeCountdown expiresAt={end} />)
  expect(screen.getByText(/Expires in 1:[23]\d/)).toBeTruthy()

  act(() => {
    vi.advanceTimersByTime(91_000)
  })
  expect(screen.getByText("This code ran out.")).toBeTruthy()
})

it("says the code is used once there is no end time", () => {
  render(<CodeCountdown expiresAt={undefined} />)
  expect(screen.getByText("Code used")).toBeTruthy()
})
