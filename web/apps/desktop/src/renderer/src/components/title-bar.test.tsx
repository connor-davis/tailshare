// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TitleBar } from "./title-bar"

import type { UpdateStatus } from "../../../shared/bridge"

let listener: (status: UpdateStatus) => void
const openReleaseLink = vi.fn<(url: string) => Promise<void>>(async () => {})
const downloadUpdate = vi.fn(async () => {})
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("tailshare", {
    getUpdateStatus: async () => ({ state: "current" }),
    onUpdateStatus: (next: typeof listener) => {
      listener = next
      return () => {}
    },
    downloadUpdate,
    openReleaseLink,
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("TitleBar", () => {
  it("shows the app name and no buttons of its own", () => {
    render(<TitleBar />)

    expect(screen.getByText("Tailshare")).toBeTruthy()
    expect(screen.queryAllByRole("button")).toEqual([])
  })

  it("renders Markdown release notes and starts a download on request", async () => {
    render(<TitleBar />)
    act(() =>
      listener({
        state: "available",
        version: "1.2.3",
        notes:
          "## Improvements\n\n- **Faster** transfers\n\n[Release](https://github.com/team/repo/releases)\n\n[External](https://example.com/)\n\n<script>bad()</script>\n\n<img src=x onerror=bad()>\n\n![No image](https://example.com/image.png)",
      })
    )
    const button = screen.getByRole("button", { name: "Update available" })
    expect(button.parentElement?.className).toContain(
      "[-webkit-app-region:no-drag]"
    )
    fireEvent.click(button)
    expect(
      screen.getByRole("dialog", { name: "What's new in 1.2.3" })
    ).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Improvements", level: 2 })
    ).toBeTruthy()
    expect(screen.getByRole("listitem").textContent).toBe("Faster transfers")
    expect(screen.getByText("Faster").tagName).toBe("STRONG")
    const release = screen.getByRole("link", { name: "Release" })
    expect(fireEvent.click(release)).toBe(false)
    await waitFor(() =>
      expect(openReleaseLink).toHaveBeenCalledExactlyOnceWith(
        "https://github.com/team/repo/releases"
      )
    )
    const external = screen.getByText("External")
    expect(external.hasAttribute("href")).toBe(false)
    fireEvent.click(external)
    expect(openReleaseLink).toHaveBeenCalledOnce()
    expect(document.querySelector("img[src=x]")).toBeNull()
    expect(document.querySelector("img[src^='https:']")).toBeNull()
    expect(screen.queryByText("bad()")).toBeNull()
    expect(document.querySelector("script")).toBeNull()
    expect(downloadUpdate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Download" }))
    await waitFor(() => expect(downloadUpdate).toHaveBeenCalledOnce())
  })

  it("dismisses only the current version, leaving newer releases visible", () => {
    render(<TitleBar />)
    const release: UpdateStatus = {
      state: "available",
      version: "1.2.3",
      notes: "Changes",
    }
    act(() => listener(release))
    fireEvent.click(screen.getByRole("button", { name: "Update available" }))
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    expect(
      screen.queryByRole("button", { name: "Update available" })
    ).toBeNull()
    act(() => listener(release))
    expect(
      screen.queryByRole("button", { name: "Update available" })
    ).toBeNull()
    act(() => listener({ ...release, version: "1.2.4" }))
    expect(
      screen.getByRole("button", { name: "Update available" })
    ).toBeTruthy()
    expect(downloadUpdate).not.toHaveBeenCalled()
  })

  it("is a drag region that leaves room for the Windows buttons", () => {
    render(<TitleBar />)

    const bar = screen.getByRole("banner")
    expect(bar.className).toContain("[-webkit-app-region:drag]")
    expect(bar.className).toContain("pr-[138px]")
  })
})
