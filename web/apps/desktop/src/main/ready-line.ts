/** The most sidecar stdout we read before giving up on the ready line. */
export const MAX_STARTUP_OUTPUT = 4096

/** What the scanner knows after each chunk. */
export type ScanResult =
  | { readonly kind: "pending" }
  | { readonly kind: "ready"; readonly baseUrl: string }
  | { readonly kind: "bad"; readonly reason: string }

const READY = /^TAILSHARE_READY (http:\/\/127\.0\.0\.1:([0-9]{1,5}))$/

/**
 * Checks one stdout line. Returns the base URL, or `null` for anything that is
 * not `TAILSHARE_READY http://127.0.0.1:<port>` with a real port.
 */
export function parseReadyLine(line: string): string | null {
  const match = READY.exec(line.trimEnd())
  if (!match) return null

  const port = Number(match[2])
  if (port < 1 || port > 65535) return null

  return match[1]
}

/**
 * Collects stdout until the first full line, which must be the ready line.
 * A bad first line or too much text without a newline is final: the sidecar
 * is not speaking our contract, so we never guess an address.
 */
export class ReadyScanner {
  private buffer = ""
  private done: ScanResult | null = null

  /** Feeds one chunk. After the first verdict, later chunks are ignored. */
  push(chunk: string): ScanResult {
    if (this.done) return this.done

    this.buffer += chunk

    const end = this.buffer.indexOf("\n")
    if (end === -1) {
      if (this.buffer.length > MAX_STARTUP_OUTPUT) {
        return this.finish({ kind: "bad", reason: "startup output too long" })
      }
      return { kind: "pending" }
    }

    const baseUrl = parseReadyLine(this.buffer.slice(0, end))
    if (!baseUrl) {
      return this.finish({ kind: "bad", reason: "bad ready line" })
    }

    return this.finish({ kind: "ready", baseUrl })
  }

  private finish(result: ScanResult): ScanResult {
    this.done = result
    this.buffer = ""
    return result
  }
}
