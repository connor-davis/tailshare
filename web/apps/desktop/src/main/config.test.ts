import { describe, expect, it } from "vitest"
import { sidecarFileName } from "./config"

describe("sidecarFileName", () => {
  it("adds .exe only on Windows", () => {
    expect(sidecarFileName("win32")).toBe("tailshare.exe")
    expect(sidecarFileName("linux")).toBe("tailshare")
    expect(sidecarFileName("darwin")).toBe("tailshare")
  })
})
