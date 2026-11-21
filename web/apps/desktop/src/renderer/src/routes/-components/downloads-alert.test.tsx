// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DownloadsStatus } from "../../../../shared/bridge"
import { DownloadsAlert } from "./downloads-alert"

let push: (status: DownloadsStatus) => void = () => {}
const chooseFolder = vi.fn()
const updateSettings = vi.fn(async () => ({}))

beforeEach(() =>
  vi.stubGlobal("tailshare", {
    getDownloadsStatus: async () => ({ ok: false }),
    onDownloadsStatus: (listener: (status: DownloadsStatus) => void) => {
      push = listener

      return () => {}
    },
    chooseFolder,
    updateSettings,
  })
)
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("DownloadsAlert", () => {
  it("explains a broken folder and offers another one", async () => {
    chooseFolder.mockResolvedValue("D:/Saved")
    render(<DownloadsAlert />)

    expect((await screen.findByRole("status")).textContent).toContain(
      "Choose another folder to turn them on."
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Choose another folder" })
    )

    await vi.waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ saveFolder: "D:/Saved" })
    )
  })

  it("disappears once the folder works", async () => {
    render(<DownloadsAlert />)
    await screen.findByRole("status")

    act(() => push({ ok: true }))

    expect(screen.queryByRole("status")).toBeNull()
  })

  it("shows nothing while the folder is fine", () => {
    vi.stubGlobal("tailshare", {
      getDownloadsStatus: async () => ({ ok: true }),
      onDownloadsStatus: () => () => {},
    })
    render(<DownloadsAlert />)

    expect(screen.queryByRole("status")).toBeNull()
  })
})
