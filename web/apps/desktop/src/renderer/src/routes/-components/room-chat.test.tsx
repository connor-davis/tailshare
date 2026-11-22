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
import type { ChatMessage, TransferView } from "@/lib/api/types"
import { RoomChat } from "./room-chat"

const mocks = vi.hoisted(() => ({
  sendMutate: vi.fn(),
  sendAsync: vi.fn(),
  startMutate: vi.fn(),
  messages: [] as unknown[],
  transfers: [] as unknown[],
  roomPreview: undefined as unknown,
  downloadPreview: undefined as unknown,
}))

vi.mock("@/lib/api/preview", () => ({
  useRoomPreview: () => ({ data: mocks.roomPreview }),
  useDownloadPreview: () => ({ data: mocks.downloadPreview }),
}))

vi.mock("@/lib/api/chat", () => ({
  useChat: () => ({ data: mocks.messages, error: null }),
  useSendChat: () => ({
    mutate: mocks.sendMutate,
    mutateAsync: mocks.sendAsync,
    isPending: false,
    error: null,
  }),
}))
vi.mock("@/lib/api/transfers", () => ({
  useTransfers: () => ({ data: mocks.transfers }),
  useClearTransfers: () => ({ mutate: vi.fn(), isPending: false }),
  useStartTransfer: () => ({
    mutate: mocks.startMutate,
    isPending: false,
    error: null,
  }),
}))

const addFiles = vi.fn()
const addDroppedFiles = vi.fn()

const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  seq: 1,
  id: "m1",
  fromPeer: true,
  text: "",
  time: "2026-11-20T10:00:00Z",
  ...over,
})
const attachment = { name: "plan.pdf", path: "plan.pdf", size: 2048 }
const transfer = (over: Partial<TransferView> = {}): TransferView => ({
  id: "t1",
  direction: "download",
  source: "plan.pdf",
  destination: "plan.pdf",
  size: 100,
  bytes: 40,
  state: "running",
  ...over,
})

let downloadsOk = true

beforeEach(() => {
  downloadsOk = true
  vi.clearAllMocks()
  mocks.messages = []
  mocks.transfers = []
  mocks.roomPreview = undefined
  mocks.downloadPreview = undefined
  mocks.sendAsync.mockResolvedValue({})
  vi.stubGlobal("tailshare", {
    addFiles,
    addDroppedFiles,
    getDownloadsStatus: async () => ({ ok: downloadsOk }),
    onDownloadsStatus: () => () => {},
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const box = () => screen.getByLabelText("Message") as HTMLTextAreaElement
const files = { types: ["Files"], files: [new File(["x"], "a.txt")] }

describe("composer", () => {
  it("sends the trimmed text on Enter and keeps it until the send worked", () => {
    render(<RoomChat />)

    fireEvent.change(box(), { target: { value: "  hello  " } })
    fireEvent.keyDown(box(), { key: "Enter" })

    expect(mocks.sendMutate).toHaveBeenCalledWith(
      { text: "hello" },
      expect.anything()
    )
    expect(box().value).toBe("  hello  ")

    mocks.sendMutate.mock.calls[0][1].onSuccess()
    return waitFor(() => expect(box().value).toBe(""))
  })

  it("starts a new line on Shift+Enter without sending", () => {
    render(<RoomChat />)

    fireEvent.change(box(), { target: { value: "hello" } })
    fireEvent.keyDown(box(), { key: "Enter", shiftKey: true })

    expect(mocks.sendMutate).not.toHaveBeenCalled()
  })

  it("does not send an empty message and keeps Send off", () => {
    render(<RoomChat />)

    fireEvent.keyDown(box(), { key: "Enter" })

    expect(mocks.sendMutate).not.toHaveBeenCalled()
    expect(
      (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })

  it("is off with a plain hint while nobody else is connected", () => {
    render(<RoomChat connected={false} />)

    expect(box().disabled).toBe(true)
    expect(
      (screen.getByRole("button", { name: "Add files" }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
    expect(screen.getByText(/once someone else joins/)).toBeTruthy()
  })
})

describe("adding files", () => {
  it("posts one message per added file from the + button", async () => {
    addFiles.mockResolvedValue({
      added: [
        { name: "a.txt", size: 1 },
        { name: "b (2).txt", size: 2 },
      ],
      skipped: [],
    })
    render(<RoomChat />)

    fireEvent.click(screen.getByRole("button", { name: "Add files" }))

    await waitFor(() => expect(mocks.sendAsync).toHaveBeenCalledTimes(2))
    expect(mocks.sendAsync).toHaveBeenNthCalledWith(1, {
      text: "",
      attachment: { path: "a.txt" },
    })
    expect(mocks.sendAsync).toHaveBeenNthCalledWith(2, {
      text: "",
      attachment: { path: "b (2).txt" },
    })
  })

  it("does nothing when the dialog is cancelled", async () => {
    addFiles.mockResolvedValue(null)
    render(<RoomChat />)

    fireEvent.click(screen.getByRole("button", { name: "Add files" }))

    await waitFor(() => expect(addFiles).toHaveBeenCalledOnce())
    expect(mocks.sendAsync).not.toHaveBeenCalled()
  })

  it("shows skipped files with the plain reason", async () => {
    addFiles.mockResolvedValue({
      added: [],
      skipped: [{ name: "big.iso", reason: "That is a folder." }],
    })
    render(<RoomChat />)

    fireEvent.click(screen.getByRole("button", { name: "Add files" }))

    expect(await screen.findByText("big.iso: That is a folder.")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toContain("big.iso")
    expect(
      screen.getByRole("button", { name: "Dismiss chat notice" })
    ).toBeTruthy()
  })
})

describe("drag and drop", () => {
  it("shows the overlay for files and hides it on leave", () => {
    render(<RoomChat />)
    const column = screen.getByRole("log").parentElement as HTMLElement

    fireEvent.dragEnter(column, { dataTransfer: files })
    expect(screen.getByText("Drop to share")).toBeTruthy()

    fireEvent.dragLeave(column, { dataTransfer: files })
    expect(screen.queryByText("Drop to share")).toBeNull()
  })

  it("ignores a drag that holds no files", () => {
    render(<RoomChat />)
    const column = screen.getByRole("log").parentElement as HTMLElement

    fireEvent.dragEnter(column, { dataTransfer: { types: ["text/plain"] } })

    expect(screen.queryByText("Drop to share")).toBeNull()
  })

  it("passes dropped files to the bridge and posts a card for each", async () => {
    addDroppedFiles.mockResolvedValue({
      added: [{ name: "a.txt", size: 1 }],
      skipped: [],
    })
    render(<RoomChat />)
    const column = screen.getByRole("log").parentElement as HTMLElement

    fireEvent.dragEnter(column, { dataTransfer: files })
    fireEvent.drop(column, { dataTransfer: files })

    expect(screen.queryByText("Drop to share")).toBeNull()
    await waitFor(() =>
      expect(addDroppedFiles).toHaveBeenCalledWith(files.files)
    )
    await waitFor(() =>
      expect(mocks.sendAsync).toHaveBeenCalledWith({
        text: "",
        attachment: { path: "a.txt" },
      })
    )
  })

  it("does not take a drop while nobody else is connected", () => {
    render(<RoomChat connected={false} />)
    const column = screen.getByRole("log").parentElement as HTMLElement

    fireEvent.drop(column, { dataTransfer: files })

    expect(addDroppedFiles).not.toHaveBeenCalled()
  })
})

describe("file cards", () => {
  it("shows a small picture for our own image", () => {
    mocks.roomPreview = { kind: "image", mime: "image/png", data: "AAAA" }
    mocks.messages = [message({ fromPeer: false, attachment })]
    render(<RoomChat />)

    expect(
      screen
        .getByRole("img", { name: "Preview of plan.pdf" })
        .getAttribute("src")
    ).toBe("data:image/png;base64,AAAA")
  })

  it("never shows a picture type that is not on the list", () => {
    mocks.roomPreview = { kind: "image", mime: "image/svg+xml", data: "AAAA" }
    mocks.messages = [message({ fromPeer: false, attachment })]
    render(<RoomChat />)

    expect(screen.queryByRole("img", { name: /Preview/ })).toBeNull()
  })

  it("shows the start of our own text file", () => {
    mocks.roomPreview = { kind: "text", text: "hello there", cut: true }
    mocks.messages = [message({ fromPeer: false, attachment })]
    render(<RoomChat />)

    expect(screen.getByText("hello there…")).toBeTruthy()
  })

  it("shows nothing for a file with no preview", () => {
    mocks.roomPreview = { kind: "none" }
    mocks.messages = [message({ fromPeer: false, attachment })]
    render(<RoomChat />)

    expect(screen.queryByRole("img", { name: /Preview/ })).toBeNull()
  })

  it("says their file can be previewed after the download", () => {
    mocks.messages = [message({ attachment })]
    render(<RoomChat />)

    expect(screen.getByText("Preview after you download it")).toBeTruthy()
  })

  it("previews their file once it is saved", () => {
    mocks.transfers = [transfer({ state: "done", bytes: 100 })]
    mocks.downloadPreview = { kind: "text", text: "saved words" }
    mocks.messages = [message({ attachment })]
    render(<RoomChat />)

    // The card must follow the transfer, which starts with a click.
    fireEvent.click(screen.getByRole("button", { name: "Download plan.pdf" }))
    act(() => mocks.startMutate.mock.calls[0][1].onSuccess({ id: "t1" }))

    expect(screen.getByText("saved words")).toBeTruthy()
    expect(screen.queryByText("Preview after you download it")).toBeNull()
  })

  it("pastes what was copied", async () => {
    const pasteFromClipboard = vi.fn(async () => ({ kind: "none" }))
    vi.stubGlobal("tailshare", { pasteFromClipboard })
    render(<RoomChat />)

    fireEvent.click(screen.getByRole("button", { name: "Paste" }))

    expect(pasteFromClipboard).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Nothing to paste/)).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it("marks our own file as Shared, with no Download button", () => {
    mocks.messages = [message({ fromPeer: false, attachment })]
    render(<RoomChat />)

    expect(screen.getByText("plan.pdf")).toBeTruthy()
    expect(screen.getByText("2.0 KB")).toBeTruthy()
    expect(screen.getByText("Shared")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull()
  })

  it("starts a download of their file into the downloads folder", () => {
    mocks.messages = [message({ attachment })]
    render(<RoomChat />)

    fireEvent.click(screen.getByRole("button", { name: "Download plan.pdf" }))

    expect(mocks.startMutate).toHaveBeenCalledWith(
      { direction: "download", source: "plan.pdf", destination: "plan.pdf" },
      expect.anything()
    )
  })

  it("turns Download off while the save folder does not work", async () => {
    downloadsOk = false
    mocks.messages = [message({ attachment })]
    render(<RoomChat />)

    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Download plan.pdf",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true)
    )
  })

  it("follows the transfer: progress, then Saved", () => {
    mocks.messages = [message({ attachment })]
    mocks.transfers = [transfer()]
    const view = render(<RoomChat />)

    fireEvent.click(screen.getByRole("button", { name: "Download plan.pdf" }))
    mocks.startMutate.mock.calls[0][1].onSuccess({ id: "t1" })
    view.rerender(<RoomChat />)

    const bar = screen.getByRole("progressbar", { name: "plan.pdf progress" })
    expect(bar.getAttribute("aria-valuenow")).toBe("40")

    mocks.transfers = [transfer({ state: "done", bytes: 100 })]
    view.rerender(<RoomChat />)

    expect(screen.getByText("Saved")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull()
  })

  it("keeps following the file when a retry gives it a new id", () => {
    mocks.messages = [message({ attachment })]
    mocks.transfers = [transfer()]
    const view = render(<RoomChat />)

    fireEvent.click(screen.getByRole("button", { name: "Download plan.pdf" }))
    mocks.startMutate.mock.calls[0][1].onSuccess({ id: "t1" })
    mocks.transfers = [transfer({ id: "t2", bytes: 70 })]
    view.rerender(<RoomChat />)

    const bar = screen.getByRole("progressbar", { name: "plan.pdf progress" })
    expect(bar.getAttribute("aria-valuenow")).toBe("70")
  })

  it("shows why a download failed and offers another try", () => {
    mocks.messages = [message({ attachment })]
    mocks.transfers = [transfer({ state: "failed", error: "Disk is full." })]
    const view = render(<RoomChat />)

    fireEvent.click(screen.getByRole("button", { name: "Download plan.pdf" }))
    mocks.startMutate.mock.calls[0][1].onSuccess({ id: "t1" })
    view.rerender(<RoomChat />)

    expect(screen.getByText("Disk is full.")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Download again plan.pdf" })
    ).toBeTruthy()
  })
})
