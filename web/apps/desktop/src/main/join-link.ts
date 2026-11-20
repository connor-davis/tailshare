/** Most links held before the page is ready. The oldest goes first. */
const MAX_PENDING = 10

// The whole link is matched as written, so nothing can hide in a query,
// fragment, port, user name, escape, backslash or extra path segment. No URL
// parser is used: its repairs (case, slashes, escapes) are what we refuse.
const LINK =
  /^tailshare:\/\/join\/([0-9A-Za-z]{8}|[0-9A-Za-z]{4}-[0-9A-Za-z]{4})$/

// Same alphabet as the Go code parser: no I, L, O or U.
const CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/

/**
 * Turns `tailshare://join/<CODE>` into the bare uppercase code, or `null` for
 * anything else. The code is 8 characters or 4+4 with a dash, any case. As in
 * the code box, O reads as 0 and I or L as 1.
 */
export function parseJoinLink(input: string): string | null {
  const match = LINK.exec(input)
  if (!match) return null

  const code = match[1]!
    .replace("-", "")
    .toUpperCase()
    .replaceAll("O", "0")
    .replaceAll(/[IL]/g, "1")

  return CODE.test(code) ? code : null
}

/** The first argument that is a good join link, as a bare code. */
export function findJoinLink(argv: readonly string[]): string | null {
  for (const arg of argv) {
    const code = parseJoinLink(arg)
    if (code) return code
  }
  return null
}

/**
 * Holds join codes until the page says it is listening, then hands them over
 * in order. Codes are secrets, so nothing here logs them.
 */
export function createJoinInbox(deliver: (code: string) => void) {
  let ready = false
  let pending: string[] = []

  return {
    /** Delivers now if the page is ready, otherwise keeps it (no repeats). */
    push(code: string) {
      if (ready) return deliver(code)
      if (pending.includes(code)) return
      pending = [...pending, code].slice(-MAX_PENDING)
    },

    /** The page is listening: send everything held, oldest first. */
    ready() {
      ready = true
      const held = pending
      pending = []
      for (const code of held) deliver(code)
    },

    /** The page is reloading, so hold links again until it says ready. */
    reset() {
      ready = false
    },
  }
}
