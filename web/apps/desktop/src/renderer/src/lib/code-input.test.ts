import { describe, expect, it } from "vitest"
import {
  cleanCode,
  foldCode,
  formatCode,
  joinLink,
  codeFromInput,
} from "./code-input"

describe("foldCode", () => {
  it("ignores case, spaces and dashes", () => {
    expect(foldCode("7k3q 9pxm")).toBe("7K3Q9PXM")
    expect(foldCode("7K3Q-9PXM")).toBe("7K3Q9PXM")
  })

  it("reads look-alikes the way codes.Parse does", () => {
    expect(foldCode("OILABC12")).toBe("011ABC12")
  })

  it("rejects U, which no code contains", () => {
    expect(foldCode("7K3U9PXM")).toBeNull()
  })

  it("rejects the wrong length", () => {
    expect(foldCode("7K3Q9")).toBeNull()
    expect(foldCode("7K3-Q9P")).toBeNull()
    expect(foldCode("7K3Q9PXMX")).toBeNull()
  })
})

describe("formatCode", () => {
  it("puts a dash after four characters", () => {
    expect(formatCode("7K3Q9PXM")).toBe("7K3Q-9PXM")
    expect(formatCode("7K")).toBe("7K")
    expect(formatCode("7K3Q")).toBe("7K3Q")
    expect(formatCode("7K3Q9")).toBe("7K3Q-9")
  })

  it("keeps one dash when the sidecar already sent one", () => {
    expect(formatCode("7K3Q-9PXM")).toBe("7K3Q-9PXM")
  })
})

describe("cleanCode", () => {
  it("stops at eight characters", () => {
    expect(cleanCode("7k3q-9pxmzz")).toBe("7K3Q9PXM")
  })
})

describe("joinLink", () => {
  it("uses the bare 8-character code", () => {
    expect(joinLink("7K3Q-9PXM")).toBe("tailshare://join/7K3Q9PXM")
    expect(joinLink("7K3Q9PXM")).toBe("tailshare://join/7K3Q9PXM")
  })
})

describe("codeFromInput", () => {
  it("reads a code or a join link", () => {
    expect(codeFromInput("7k3q-9pxm")).toBe("7K3Q9PXM")
    expect(codeFromInput(" tailshare://join/7K3Q9PXM ")).toBe("7K3Q9PXM")
  })

  it("refuses anything else", () => {
    expect(codeFromInput("https://join/7K3Q9PXM")).toBeNull()
    expect(codeFromInput("tailshare://join/7K3Q9PXM/extra")).toBeNull()
    expect(codeFromInput("tailshare://join/7K3Q9PXM?x=1")).toBeNull()
    expect(codeFromInput("")).toBeNull()
  })
})
