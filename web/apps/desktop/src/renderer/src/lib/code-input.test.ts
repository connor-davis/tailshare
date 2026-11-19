import { describe, expect, it } from "vitest"
import { cleanCode, foldCode, formatCode } from "./code-input"

describe("foldCode", () => {
  it("ignores case, spaces and dashes", () => {
    expect(foldCode("7k3 q9p")).toBe("7K3Q9P")
    expect(foldCode("7K3-Q9P")).toBe("7K3Q9P")
  })

  it("reads look-alikes the way codes.Parse does", () => {
    expect(foldCode("OIL000")).toBe("011000")
  })

  it("rejects U, which no code contains", () => {
    expect(foldCode("7K3U9P")).toBeNull()
  })

  it("rejects the wrong length", () => {
    expect(foldCode("7K3Q9")).toBeNull()
    expect(foldCode("7K3Q9PX")).toBeNull()
  })
})

describe("formatCode", () => {
  it("puts a dash after three characters", () => {
    expect(formatCode("7K3Q9P")).toBe("7K3-Q9P")
    expect(formatCode("7K")).toBe("7K")
  })

  it("keeps one dash when the sidecar already sent one", () => {
    expect(formatCode("7K3-Q9P")).toBe("7K3-Q9P")
  })
})

describe("cleanCode", () => {
  it("stops at six characters", () => {
    expect(cleanCode("7k3-q9pzz")).toBe("7K3Q9P")
  })
})
