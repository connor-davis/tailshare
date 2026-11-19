/** Crockford base32, the same alphabet as `codes.alphabet` in Go. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/** Characters in a code, not counting the dash. */
export const CODE_LENGTH = 6

/** Drop spaces and dashes, upper-case, and read O as 0 and I or L as 1. */
function normalise(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[-\s]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
}

/**
 * Tidy what the user typed and stop at six characters. Letters outside the
 * alphabet stay, so the screen can point at them.
 */
export function cleanCode(raw: string): string {
  return normalise(raw).slice(0, CODE_LENGTH)
}

/** True when `code` holds a character a real code can never contain. */
export function hasBadCharacter(code: string): boolean {
  return [...code].some((character) => !ALPHABET.includes(character))
}

/**
 * Same rules as `codes.Parse`: returns the six-character code, or `null` when
 * the length or a character is wrong.
 */
export function foldCode(raw: string): string | null {
  const folded = normalise(raw)

  if (folded.length !== CODE_LENGTH || hasBadCharacter(folded)) return null

  return folded
}

/** Show a code the way people read it aloud: `7K3-Q9P`. */
export function formatCode(code: string): string {
  // The sidecar already sends `7K3-Q9P`, so drop any dash before adding ours.
  const bare = code.replace(/-/g, "")
  if (bare.length <= 3) return bare

  return `${bare.slice(0, 3)}-${bare.slice(3)}`
}
