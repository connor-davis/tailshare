import { describe, expect, it } from "vitest"
import {
  formatBytes,
  formatCountdown,
  formatAgo,
  formatDate,
  formatSpeed,
  percent,
} from "./format"

describe("format", () => {
  it("writes bytes with units", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(3.1 * 1024 * 1024)).toBe("3.1 MB")
    expect(formatBytes(250 * 1024 ** 3)).toBe("250 GB")
  })

  it("writes speed, or a dash before there is one", () => {
    expect(formatSpeed(2 * 1024 * 1024)).toBe("2.0 MB/s")
    expect(formatSpeed(undefined)).toBe("—")
    expect(formatSpeed(0)).toBe("—")
  })

  it("counts percent without passing 100", () => {
    expect(percent(42, 100)).toBe(42)
    expect(percent(200, 100)).toBe(100)
    expect(percent(0, 0)).toBe(100)
  })

  it("counts down as minutes and seconds", () => {
    expect(formatCountdown(599_000)).toBe("9:59")
    expect(formatCountdown(600_000)).toBe("10:00")
    expect(formatCountdown(-5)).toBe("0:00")
  })

  it("gives a dash for a date it cannot read", () => {
    expect(formatDate("not a date")).toBe("—")
    expect(formatDate("2026-11-20T10:00:00Z")).toContain("2026")
  })
})

describe("formatAgo", () => {
  it("uses the shortest unit", () => {
    const now = 10 * 24 * 3600_000

    expect(formatAgo(now - 30_000, now)).toBe("now")
    expect(formatAgo(now - 5 * 60_000, now)).toBe("5m")
    expect(formatAgo(now - 2 * 3600_000, now)).toBe("2h")
    expect(formatAgo(now - 3 * 24 * 3600_000, now)).toBe("3d")
    expect(formatAgo(now + 60_000, now)).toBe("now")
  })
})
