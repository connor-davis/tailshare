// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TitleBar } from "./title-bar"

afterEach(cleanup)

describe("TitleBar", () => {
  it("shows the app name and no buttons of its own", () => {
    render(<TitleBar />)

    expect(screen.getByText("Tailshare")).toBeTruthy()
    expect(screen.queryAllByRole("button")).toEqual([])
  })

  it("is a drag region that leaves room for the Windows buttons", () => {
    render(<TitleBar />)

    const bar = screen.getByRole("banner")
    expect(bar.className).toContain("[-webkit-app-region:drag]")
    expect(bar.className).toContain("pr-[138px]")
  })
})
