/** Reads a Tailshare join link or bare code, returning the canonical code or null. */
export function scanCode(raw: string): string | null {
  const text = raw.trim()
  const link = /^tailshare:\/\/join\/([^/?#\s]+)\/?$/i.exec(text)
  const code = (link ? link[1] : text)
    .toUpperCase()
    .replace(/[- ]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")

  return /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(code) ? code : null
}
