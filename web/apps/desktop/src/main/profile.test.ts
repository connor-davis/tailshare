import { describe, expect, it } from "vitest"
import { findProfile } from "./profile"

describe("findProfile", () => {
  it("reads a profile name", () => {
    expect(findProfile(["electron", ".", "--profile=Friend-2"])).toBe(
      "friend-2"
    )
  })

  it("refuses names that could leave the app's folder", () => {
    expect(findProfile(["--profile=../x"])).toBeNull()
    expect(findProfile(["--profile="])).toBeNull()
    expect(findProfile(["--profile=a/b"])).toBeNull()
    expect(findProfile(["--profile", "x"])).toBeNull()
  })
})
