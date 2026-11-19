const UNITS = ["B", "KB", "MB", "GB", "TB"]

/** Bytes as text, such as `3.1 MB`. Whole numbers below 1 KB. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes)
  let unit = 0

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }

  const digits = unit === 0 || value >= 100 ? 0 : 1

  return `${value.toFixed(digits)} ${UNITS[unit]}`
}

/** Bytes per second as text, or a dash when there is no speed yet. */
export function formatSpeed(bytesPerSecond: number | undefined): string {
  if (bytesPerSecond === undefined || bytesPerSecond <= 0) return "—"

  return `${formatBytes(bytesPerSecond)}/s`
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
  const seconds = String(total % 60).padStart(2, "0")

  return `${minutes}:${seconds}`
}

/** A file's change time as a short local date and time. */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** A chat message's time of day. */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
}
