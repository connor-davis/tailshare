// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { followColorScheme } from "./theme"

/** A media query we can flip by hand. */
function fakeQuery(matches: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches,
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  }

  return {
    query: query as unknown as MediaQueryList,
    set(next: boolean) {
      query.matches = next
      listeners.forEach((listener) => listener())
    },
    count: () => listeners.size,
  }
}

describe("followColorScheme", () => {
  it("sets dark at once when the system is dark", () => {
    const root = document.createElement("html")
    followColorScheme(fakeQuery(true).query, root)

    expect(root.classList.contains("dark")).toBe(true)
  })

  it("stays light when the system is light", () => {
    const root = document.createElement("html")
    followColorScheme(fakeQuery(false).query, root)

    expect(root.classList.contains("dark")).toBe(false)
  })

  it("follows changes, then stops when told", () => {
    const root = document.createElement("html")
    const fake = fakeQuery(false)
    const stop = followColorScheme(fake.query, root)

    fake.set(true)
    expect(root.classList.contains("dark")).toBe(true)
    fake.set(false)
    expect(root.classList.contains("dark")).toBe(false)

    stop()
    expect(fake.count()).toBe(0)
    fake.set(true)
    expect(root.classList.contains("dark")).toBe(false)
  })
})
