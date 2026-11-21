// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { RoomFiles } from "./room-files"

const share = vi.hoisted(() => ({
  addFiles: vi.fn(),
  addDropped: vi.fn(),
  busy: false,
  error: null,
  skipped: [],
  dismiss: vi.fn(),
}))
vi.mock("./use-share-files", () => ({ useShareFiles: () => share }))
vi.mock("@/lib/api/chat", () => ({
  useChat: () => ({
    data: [
      { id: "text", text: "A message" },
      {
        id: "file",
        fromPeer: true,
        attachment: { name: "notes.txt", size: 10, path: "notes.txt" },
      },
    ],
  }),
}))
vi.mock("./file-card", () => ({
  FileCard: ({
    attachment,
    fromPeer,
  }: {
    attachment: { name: string }
    fromPeer: boolean
  }) => (
    <p>
      {attachment.name} {fromPeer ? "from peer" : "from you"}
    </p>
  ),
}))

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

it("collects real chat attachments and opens the existing file picker", () => {
  render(<RoomFiles connected />)
  expect(screen.getByText("notes.txt from peer")).toBeTruthy()
  expect(screen.queryByText("A message")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Share files" }))
  expect(share.addFiles).toHaveBeenCalledOnce()
})

it("passes dropped files through the guarded desktop import flow", () => {
  const { container } = render(<RoomFiles connected />)
  const file = new File(["hello"], "notes.txt")
  fireEvent.drop(container.firstChild!, {
    dataTransfer: { types: ["Files"], files: [file] },
  })
  expect(share.addDropped).toHaveBeenCalledWith([file])
})

it("disables the picker and ignores drops while waiting for a peer", () => {
  const { container } = render(<RoomFiles connected={false} />)
  expect(
    screen.getByRole("button", { name: "Share files" }).hasAttribute("disabled")
  ).toBe(true)
  fireEvent.drop(container.firstChild!, {
    dataTransfer: {
      types: ["Files"],
      files: [new File(["hello"], "notes.txt")],
    },
  })
  expect(share.addDropped).not.toHaveBeenCalled()
})
