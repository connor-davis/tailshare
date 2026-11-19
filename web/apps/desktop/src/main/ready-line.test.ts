import { describe, expect, it } from "vitest"
import { MAX_STARTUP_OUTPUT, parseReadyLine, ReadyScanner } from "./ready-line"

describe("parseReadyLine", () => {
  it("accepts the loopback ready line", () => {
    expect(parseReadyLine("TAILSHARE_READY http://127.0.0.1:51234")).toBe(
      "http://127.0.0.1:51234"
    )
    expect(parseReadyLine("TAILSHARE_READY http://127.0.0.1:80\r")).toBe(
      "http://127.0.0.1:80"
    )
  })

  it.each([
    ["empty", ""],
    ["wrong word", "READY http://127.0.0.1:1234"],
    ["no port", "TAILSHARE_READY http://127.0.0.1"],
    ["port zero", "TAILSHARE_READY http://127.0.0.1:0"],
    ["port too big", "TAILSHARE_READY http://127.0.0.1:65536"],
    ["path", "TAILSHARE_READY http://127.0.0.1:1234/api"],
    ["trailing words", "TAILSHARE_READY http://127.0.0.1:1234 extra"],
    ["https", "TAILSHARE_READY https://127.0.0.1:1234"],
    ["localhost name", "TAILSHARE_READY http://localhost:1234"],
    ["all interfaces", "TAILSHARE_READY http://0.0.0.0:1234"],
    ["other loopback", "TAILSHARE_READY http://127.0.0.2:1234"],
    ["lan address", "TAILSHARE_READY http://192.168.1.5:1234"],
    ["lookalike host", "TAILSHARE_READY http://127.0.0.1.evil.test:1234"],
    ["userinfo", "TAILSHARE_READY http://x@127.0.0.1:1234"],
  ])("rejects %s", (_name, line) => {
    expect(parseReadyLine(line)).toBeNull()
  })
})

describe("ReadyScanner", () => {
  it("waits for a full line, even across chunks", () => {
    const scanner = new ReadyScanner()

    expect(scanner.push("TAILSHARE_READY http://127.0.0.1:")).toEqual({
      kind: "pending",
    })
    expect(scanner.push("4000\n")).toEqual({
      kind: "ready",
      baseUrl: "http://127.0.0.1:4000",
    })
  })

  it("ignores everything after its verdict", () => {
    const scanner = new ReadyScanner()
    scanner.push("TAILSHARE_READY http://127.0.0.1:4000\n")

    expect(scanner.push("noise\n").kind).toBe("ready")
  })

  it("refuses a malformed first line", () => {
    const scanner = new ReadyScanner()

    expect(scanner.push("hello world\n").kind).toBe("bad")
  })

  it("refuses a non-loopback first line", () => {
    const scanner = new ReadyScanner()

    expect(scanner.push("TAILSHARE_READY http://0.0.0.0:80\n").kind).toBe("bad")
  })

  it("gives up on oversized output with no newline", () => {
    const scanner = new ReadyScanner()

    expect(scanner.push("x".repeat(MAX_STARTUP_OUTPUT + 1)).kind).toBe("bad")
    expect(scanner.push("TAILSHARE_READY http://127.0.0.1:4000\n").kind).toBe(
      "bad"
    )
  })
})
