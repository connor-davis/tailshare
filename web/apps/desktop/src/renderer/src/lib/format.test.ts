import { setLocale } from "../i18n"
import { afterEach, describe, expect, it } from "vitest"
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
    expect(formatBytes(0)).toBe("0 byte")
    expect(formatBytes(1536)).toBe("1.5 kB")
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
    expect(formatAgo(now - 5 * 60_000, now)).toBe("5m ago")
    expect(formatAgo(now - 2 * 3600_000, now)).toBe("2h ago")
    expect(formatAgo(now - 3 * 24 * 3600_000, now)).toBe("3d ago")
    expect(formatAgo(now + 60_000, now)).toBe("now")
  })
})

afterEach(() => setLocale("en"))

it("formats binary-scaled sizes, speed, dates and relative time in French", () => {
  setLocale("fr")
  expect(formatBytes(1536)).toBe(
    new Intl.NumberFormat("fr", {
      style: "unit",
      unit: "kilobyte",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(1.5)
  )
  expect(formatBytes(1536)).toContain("1,5")
  expect(formatSpeed(1536)).toBe(
    new Intl.NumberFormat("fr", {
      style: "unit",
      unit: "kilobyte-per-second",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(1.5)
  )
  expect(formatAgo(0, 300_000)).toBe(
    new Intl.RelativeTimeFormat("fr", {
      numeric: "always",
      style: "narrow",
    }).format(-5, "minute")
  )
  const iso = "2026-11-20T10:00:00Z"
  expect(formatDate(iso)).toBe(
    new Intl.DateTimeFormat("fr", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso))
  )
})
