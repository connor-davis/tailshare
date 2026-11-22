import { getLocale, t } from "../i18n"

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"]

/** Bytes as text, such as `3.1 MB`. Whole numbers below 1 KB. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes)
  let unit = 0

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }

  const digits = unit === 0 || value >= 100 ? 0 : 1

  return new Intl.NumberFormat(getLocale(), {
    style: "unit",
    unit: UNITS[unit],
    unitDisplay: "short",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** Bytes per second as text, or a dash when there is no speed yet. */
export function formatSpeed(bytesPerSecond: number | undefined): string {
  if (bytesPerSecond === undefined || bytesPerSecond <= 0) return "—"

  let value = bytesPerSecond
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }

  const digits = unit === 0 || value >= 100 ? 0 : 1
  return new Intl.NumberFormat(getLocale(), {
    style: "unit",
    unit: `${UNITS[unit]}-per-second`,
    unitDisplay: "short",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** Whole percent done, never above 100. A zero-byte file counts as done. */
export function percent(bytes: number, size: number): number {
  if (size <= 0) return 100

  return Math.min(100, Math.floor((bytes / size) * 100))
}

/** Milliseconds left as `9:59`. Never negative. */
export function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(total / 60)
  const number = new Intl.NumberFormat(getLocale(), { useGrouping: false })
  const seconds = new Intl.NumberFormat(getLocale(), {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(total % 60)

  return `${number.format(minutes)}:${seconds}`
}

/** A file's change time as a short local date and time. */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat(getLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

/** A chat message's time of day. */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat(getLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

/** How long ago a time was, using the locale's narrow relative-time units. */
export function formatAgo(then: number, now = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - then) / 60000)
  if (minutes < 1) return t("format.now")
  const relative = new Intl.RelativeTimeFormat(getLocale(), {
    numeric: "always",
    style: "narrow",
  })
  if (minutes < 60) return relative.format(-minutes, "minute")
  if (minutes < 60 * 24)
    return relative.format(-Math.floor(minutes / 60), "hour")

  return relative.format(-Math.floor(minutes / (60 * 24)), "day")
}
