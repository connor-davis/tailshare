import { describe, expect, it } from "vitest"
import { errorMessage } from "./error-message"

describe("API error messages", () => {
  it("translates a known code without inspecting its English message", () => {
    expect(errorMessage("not_connected", "Different server wording.")).toBe(
      "Connect to another computer first."
    )
    expect(errorMessage("bad_path", "Different server wording.")).toBe(
      "That path is not allowed."
    )
  })

  it("preserves unknown and coarse-code messages, including prototype names", () => {
    for (const code of [
      "future_code",
      "bad_request",
      "conflict",
      "not_found",
      "unavailable",
      "constructor",
      "__proto__",
    ])
      expect(errorMessage(code, "Keep the specific explanation.")).toBe(
        "Keep the specific explanation."
      )
  })
})
