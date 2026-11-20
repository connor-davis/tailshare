// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SessionState } from "@/lib/api/types"
import { Route } from "../index"

const mocks = vi.hoisted(() => ({
  hostMutate: vi.fn(),
  joinMutate: vi.fn(),
  panels: {} as Record<string, Record<string, unknown>>,
}))
const { hostMutate, joinMutate, panels } = mocks
let session: SessionState = { state: "idle" }
let joinLink: (code: string) => void = () => {}

vi.mock("@/lib/api/session", () => {
  const action = (mutate: () => void) => () => ({
    mutate,
    isPending: false,
    error: null,
  })

  return {
    useSession: () => ({ data: session }),
    useHost: action(mocks.hostMutate),
    useJoin: action(mocks.joinMutate),
    useLeave: action(vi.fn()),
  }
})
vi.mock("@/lib/api/transfers", () => ({
  useTransfers: () => ({ data: [] }),
  useStartTransfer: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))
vi.mock("@/lib/api/chat", () => ({
  useChat: () => ({ data: [] }),
  useSendChat: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))
vi.mock("@/lib/live/use-live", () => ({ useLiveStatus: () => "open" }))
vi.mock("@/components/settings/use-settings", () => ({
  useSettings: () => ({ settings: { displayName: "Studio" } }),
}))
vi.mock("@/components/settings/settings-dialog", () => ({
  useOpenSettings: () => vi.fn(),
}))
vi.mock("@/components/update-button", () => ({
  UpdateButton: () => <p>update slot</p>,
}))
vi.mock("./room-sidebar", () => ({
  RoomSidebar: () => <aside aria-label="Rooms" />,
}))
// Plain boxes that remember their props, so the test can read min and max.
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResizableHandle: () => <hr />,
  ResizablePanel: ({
    id,
    children,
    ...rest
  }: { id: string; children: ReactNode } & Record<string, unknown>) => {
    mocks.panels[id] = rest

    return <section data-panel={id}>{children}</section>
  },
}))

const openRoomFolder = vi.fn(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  session = { state: "idle" }
  vi.stubGlobal("tailshare", {
    onJoinLink: (listener: (code: string) => void) => {
      joinLink = listener

      return () => {}
    },
    touchRecentRoom: async () => {},
    openRoomFolder,
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function shellNode() {
  const Component = Route.options.component as () => ReactNode

  return <Component />
}

function shell() {
  return render(<TooltipProvider>{shellNode()}</TooltipProvider>)
}

describe("shell", () => {
  it("shows the empty state, an update slot and an empty Members column when idle", () => {
    shell()

    expect(
      screen.getByRole("heading", { name: "Share files with a friend" })
    ).toBeTruthy()
    expect(screen.getByLabelText("Join with a code or link")).toBeTruthy()
    expect(screen.getByText("update slot")).toBeTruthy()
    expect(screen.getByText("Nobody here yet")).toBeTruthy()
    expect(screen.getByRole("complementary", { name: "Members" })).toBeTruthy()
  })

  it("asks for a room name, then creates the room with it", async () => {
    shell()

    fireEvent.click(screen.getByRole("button", { name: "Create room" }))
    const box = (await screen.findByLabelText("Room name")) as HTMLInputElement
    expect(box.value).toBe("Studio's room")
    expect(hostMutate).not.toHaveBeenCalled()

    fireEvent.change(box, { target: { value: "Movie night" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    expect(hostMutate).toHaveBeenCalledOnce()
    expect(hostMutate.mock.calls[0][0]).toBe("Movie night")
  })

  it("never asks for a folder, idle or in a room", () => {
    const view = shell()
    expect(screen.queryByText(/folder/i)).toBeNull()

    session = { state: "hosting", role: "host", code: "7K3Q9PXM" }
    view.rerender(<TooltipProvider>{shellNode()}</TooltipProvider>)
    expect(screen.queryByText(/choose a folder/i)).toBeNull()
  })

  it("shows the chat with a disabled composer while hosting", () => {
    session = {
      state: "hosting",
      role: "host",
      code: "7K3Q9PXM",
      members: [{ id: "a", displayName: "Studio", host: true, you: true }],
    }
    shell()

    expect(screen.getByText("Waiting for someone to join…")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open folder" })).toBeTruthy()
    expect(screen.queryByRole("tab")).toBeNull()
    expect(screen.getByText("You (host)")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
    expect(
      (screen.getByLabelText("Message") as HTMLTextAreaElement).disabled
    ).toBe(true)
  })

  it("opens the host's room folder by its code", () => {
    session = { state: "hosting", role: "host", code: "7K3Q9PXM" }
    shell()

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))

    expect(openRoomFolder).toHaveBeenCalledWith("7K3Q9PXM")
  })

  it("opens a joiner's room folder by the code they joined with", () => {
    const view = shell()
    joinLink("ABCD2345")
    session = {
      state: "connected",
      role: "joiner",
      peer: { displayName: "Pat" },
    }
    act(() =>
      joinMutate.mock.calls[0][1].onSuccess({ peer: { displayName: "Pat" } })
    )
    view.rerender(<TooltipProvider>{shellNode()}</TooltipProvider>)

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))

    expect(openRoomFolder).toHaveBeenCalledWith("ABCD2345")
  })

  it("shows chat, transfers at the bottom and members when connected", () => {
    session = {
      state: "connected",
      role: "joiner",
      peer: { displayName: "Pat" },
      members: [
        { id: "a", displayName: "Pat", host: true },
        { id: "b", displayName: "Studio", you: true },
      ],
    }
    shell()

    expect(screen.getByRole("log", { name: "Chat messages" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add files" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Transfers" })).toBeTruthy()
    expect(screen.getByText("Host")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Leave" })).toBeTruthy()
    // Chat on top, transfers below it, both in the room column.
    expect(panels.chat).toBeTruthy()
    expect(panels.transfers.maxSize).toBe("70%")
    expect(panels.transfers.collapsible).toBeFalsy()
  })

  it("collapses the transfers panel to its header and remembers it", () => {
    session = {
      state: "connected",
      role: "joiner",
      peer: { displayName: "Pat" },
    }
    shell()

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }))

    expect(window.localStorage.getItem("tailshare.layout.transfers.open")).toBe(
      "false"
    )
    expect(screen.getByRole("button", { name: "Expand" })).toBeTruthy()
  })

  it("joins when a tailshare link arrives", async () => {
    shell()

    joinLink("7K3Q9PXM")

    await waitFor(() =>
      expect(joinMutate).toHaveBeenCalledWith("7K3Q9PXM", expect.anything())
    )
  })

  it("never lets a drag collapse a column, and sets limits", () => {
    shell()

    for (const id of ["rooms", "members"]) {
      // The sidebar mock above is not a panel; only content and members are.
      if (!panels[id]) continue
      expect(panels[id].collapsible).toBeFalsy()
      expect(panels[id].minSize).toBe(200)
    }
    expect(panels.members.maxSize).toBe("40%")
    expect(panels.rooms.maxSize).toBe("50%")
  })

  it("hides and shows the columns with their toggles, and remembers it", () => {
    const view = shell()

    fireEvent.click(screen.getByRole("button", { name: "Show or hide rooms" }))
    expect(screen.queryByRole("complementary", { name: "Rooms" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Show or hide rooms" }))
    expect(screen.getByRole("complementary", { name: "Rooms" })).toBeTruthy()

    fireEvent.click(
      screen.getByRole("button", { name: "Show or hide members" })
    )
    expect(screen.queryByRole("complementary", { name: "Members" })).toBeNull()
    expect(window.localStorage.getItem("tailshare.layout.members.open")).toBe(
      "false"
    )

    // The saved choice survives a fresh start.
    view.unmount()
    shell()
    expect(screen.queryByRole("complementary", { name: "Members" })).toBeNull()

    fireEvent.click(
      screen.getByRole("button", { name: "Show or hide members" })
    )
    expect(screen.getByRole("complementary", { name: "Members" })).toBeTruthy()
  })

  it("keeps the 138 px caption corner empty on the rightmost bar", () => {
    shell()
    const bars = screen.getAllByRole("banner")

    // Members is open and rightmost, the middle bar is not.
    expect(
      bars.filter((bar) => bar.className.includes("pr-[138px]"))
    ).toHaveLength(1)

    fireEvent.click(
      screen.getByRole("button", { name: "Show or hide members" })
    )
    expect(
      screen
        .getAllByRole("banner")
        .filter((bar) => bar.className.includes("pr-[138px]"))
    ).toHaveLength(1)
  })
})
