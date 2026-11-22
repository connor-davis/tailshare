// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { RoomFolderBrowser } from "./room-folder-browser"

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), start: vi.fn() }))
vi.mock("@/lib/api/client", () => ({ apiFetch: mocks.fetch }))
vi.mock("@/lib/api/transfers", () => ({
  useStartTransfer: () => ({ mutate: mocks.start }),
}))
vi.mock("@/components/use-downloads-status", () => ({
  useDownloadsOk: () => true,
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it("loads opened folders only, filters loaded names, pages and downloads files or folders", async () => {
  mocks.fetch.mockImplementation(async (url: string) => {
    const params = new URL(url, "http://local").searchParams
    if (params.get("path") === "Tree/sub")
      return {
        entries: [{ name: "inside.txt", isDir: false, size: 3 }],
        total: 1,
      }

    if (params.get("offset") === "2")
      return {
        entries: [{ name: "later.txt", isDir: false, size: 4 }],
        total: 3,
      }

    return {
      entries: [
        { name: "sub", isDir: true, size: 0 },
        { name: "first.txt", isDir: false, size: 2 },
      ],
      total: 3,
    }
  })

  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RoomFolderBrowser
        folder={{ name: "Tree", path: "Tree", scope: "peer" }}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  )
  await screen.findByText("first.txt")
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText("Filter Tree"), {
    target: { value: "first" },
  })

  expect(screen.queryByRole("button", { name: "sub" })).toBeNull()
  expect(mocks.fetch).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText("Filter Tree"), {
    target: { value: "" },
  })

  fireEvent.click(screen.getByRole("button", { name: "sub" }))
  await screen.findByText("inside.txt")
  expect(mocks.fetch).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole("button", { name: "sub" }))
  fireEvent.click(screen.getByRole("button", { name: "sub" }))
  expect(mocks.fetch).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole("button", { name: "Download sub" }))
  expect(mocks.start).toHaveBeenCalledWith({
    direction: "download",
    source: "Tree/sub",
    destination: "sub",
    folder: true,
  })

  fireEvent.click(screen.getByRole("button", { name: "Download first.txt" }))
  expect(mocks.start).toHaveBeenCalledWith({
    direction: "download",
    source: "Tree/first.txt",
    destination: "first.txt",
  })

  fireEvent.click(screen.getByRole("button", { name: "Load more in Tree" }))
  await screen.findByText("later.txt")
  expect(mocks.fetch).toHaveBeenCalledTimes(3)
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Load more in Tree" })
    ).toBeNull()
  )
})

it("moves focus to the folder name when it opens", async () => {
  mocks.fetch.mockResolvedValue({ entries: [], total: 0 })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RoomFolderBrowser
        folder={{ name: "Photos", path: "Photos", scope: "local" }}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  )

  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: "Photos" })
  )
  await screen.findByText("This folder is empty.")
})

it("leaves focus alone when the person is typing elsewhere", async () => {
  mocks.fetch.mockResolvedValue({ entries: [], total: 0 })
  const field = document.createElement("input")
  document.body.append(field)
  field.focus()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RoomFolderBrowser
        folder={{ name: "Photos", path: "Photos", scope: "local" }}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  )

  expect(document.activeElement).toBe(field)
  field.remove()
  await screen.findByText("This folder is empty.")
})

it("uses the local endpoint for our own folder and shows an empty state", async () => {
  mocks.fetch.mockResolvedValue({ entries: [], total: 0 })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RoomFolderBrowser
        folder={{ name: "Mine", path: "Mine", scope: "local" }}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  )
  await screen.findByText("This folder is empty.")
  expect(mocks.fetch.mock.calls[0][0]).toContain("/api/files/local?")
})
