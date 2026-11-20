// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DragBar, NoDrag } from "./drag-bar"

afterEach(cleanup)

describe("DragBar", () => {
  it("drags the window and keeps its buttons clickable", () => {
    render(
      <DragBar>
        <NoDrag>
          <button>Go</button>
        </NoDrag>
      </DragBar>
    )

    expect(screen.getByRole("banner").className).toContain(
      "[-webkit-app-region:drag]"
    )
    expect(screen.getByRole("button").parentElement?.className).toContain(
      "[-webkit-app-region:no-drag]"
    )
  })

  it("leaves the 138 px caption corner empty only when asked", () => {
    const { rerender } = render(<DragBar />)
    expect(screen.getByRole("banner").className).not.toContain("pr-[138px]")

    rerender(<DragBar reserveCaption />)
    expect(screen.getByRole("banner").className).toContain("pr-[138px]")
  })
})
