const FLAG = /^--profile=([a-z0-9-]{1,32})$/i

/**
 * The name after `--profile=` on the command line, or `null`. A profile is a
 * separate copy of the app with its own settings, rooms and recent list, so
 * two copies can run side by side on one computer and join each other.
 */
export function findProfile(argv: readonly string[]): string | null {
  for (const arg of argv) {
    const match = FLAG.exec(arg)
    if (match) return match[1]!.toLowerCase()
  }

  return null
}
