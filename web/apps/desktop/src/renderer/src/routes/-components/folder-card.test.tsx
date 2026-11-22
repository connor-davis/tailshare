// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { FileCard } from "./file-card"
import { FolderBrowseContext } from "./folder-browse-context"

const mocks = vi.hoisted(() => ({ start: vi.fn(), preview: vi.fn() }))
vi.mock("@/lib/api/transfers", () => ({
  useTransfers: () => ({ data: [] }),
  useStartTransfer: () => ({ mutate: mocks.start }),
}))
vi.mock("@/lib/api/preview", () => ({
  useRoomPreview: mocks.preview,
  useDownloadPreview: () => ({}),
}))
vi.mock("@/components/use-downloads-status", () => ({
  useDownloadsOk: () => true,
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it.each([true, false])(
  "shows a folder card and browses the right scope (peer=%s)",
  (fromPeer) => {
    mocks.preview.mockReturnValue({})

    const browse = vi.fn()
    render(
      <FolderBrowseContext value={browse}>
        <FileCard
          attachment={{
            name: "Photos",
            path: "Photos",
            size: 2048,
            folder: true,
            count: 3,
          }}
          fromPeer={fromPeer}
        />
      </FolderBrowseContext>
    )
    expect(screen.getByText(/3 files/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Browse Photos" }))
    expect(browse).toHaveBeenCalledWith({
      name: "Photos",
      path: "Photos",
      scope: fromPeer ? "peer" : "local",
    })

    expect(mocks.preview).toHaveBeenCalledWith("Photos", false)
    if (fromPeer) {
      fireEvent.click(screen.getByRole("button", { name: "Download Photos" }))
      expect(mocks.start).toHaveBeenCalledWith(
        {
          direction: "download",
          source: "Photos",
          destination: "Photos",
          folder: true,
        },
        expect.anything()
      )
    }
  }
)
