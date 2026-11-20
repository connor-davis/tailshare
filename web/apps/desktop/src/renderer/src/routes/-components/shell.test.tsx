// @vitest-environment jsdom
import {
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
  chooseMutate: vi.fn(),
  panels: {} as Record<string, Record<string, unknown>>,
}))
const { hostMutate, joinMutate, chooseMutate, panels } = mocks
let session: SessionState = { state: "idle" }
let folder: { name: string } | null = { name: "Share" }
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
vi.mock("@/lib/api/folder", () => ({
  useFolder: () => ({ data: folder }),
  useChooseFolder: () => ({
    mutate: mocks.chooseMutate,
    isPending: false,
    error: null,
  }),
}))
vi.mock("@/lib/api/transfers", () => ({ useTransfers: () => ({ data: [] }) }))
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
vi.mock("./room-files", () => ({
  RoomFiles: ({ peer }: { peer?: object }) => (
    <p>{peer ? "files with peer" : "files alone"}</p>
  ),
}))
vi.mock("./room-sidebar", () => ({
  RoomSidebar: () => <aside aria-label="Rooms" />,
}))
vi.mock("./folder-hint", () => ({ FolderHint: () => null }))
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

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  session = { state: "idle" }
  folder = { name: "Share" }
  vi.stubGlobal("tailshare", {
    onJoinLink: (listener: (code: string) => void) => {
      joinLink = listener

      return () => {}
    },
    touchRecentRoom: async () => {},
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function shell() {
  const Component = Route.options.component as () => ReactNode

  return render(
    <TooltipProvider>
      <Component />
    </TooltipProvider>
  )
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

  it("creates a room from the big button", () => {
    shell()

    fireEvent.click(screen.getByRole("button", { name: "Create room" }))

    expect(hostMutate).toHaveBeenCalledOnce()
  })

  it("asks for a folder first, then creates the room", () => {
    folder = null
    chooseMutate.mockImplementation((_arg, options) =>
      options.onSuccess({ name: "Picked" })
    )
    shell()

    fireEvent.click(screen.getByRole("button", { name: "Create room" }))

    expect(chooseMutate).toHaveBeenCalledOnce()
    expect(hostMutate).toHaveBeenCalledOnce()
  })

  it("does nothing when the folder picker is cancelled", () => {
    folder = null
    chooseMutate.mockImplementation((_arg, options) => options.onSuccess(null))
    shell()

    fireEvent.click(screen.getByRole("button", { name: "Create room" }))

    expect(hostMutate).not.toHaveBeenCalled()
  })

  it("shows the room with tabs, the code and a disabled chat while hosting", () => {
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
    expect(screen.getByRole("tab", { name: "Files" })).toBeTruthy()
    expect(screen.getByText("files alone")).toBeTruthy()
    expect(screen.getByText("You (host)")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Chat" }))
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }))
    expect(
      (screen.getByLabelText("Message") as HTMLInputElement).disabled
    ).toBe(true)
  })

  it("shows files, chat, members and transfers when connected", () => {
    session = {
      state: "connected",
      role: "joiner",
      peer: { displayName: "Pat", sharedFolderName: "Photos" },
      members: [
        { id: "a", displayName: "Pat", host: true },
        { id: "b", displayName: "Studio", you: true },
      ],
    }
    shell()

    expect(screen.getByText("files with peer")).toBeTruthy()
    expect(screen.getByRole("region", { name: "Transfers" })).toBeTruthy()
    expect(screen.getByText("Host")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Leave" })).toBeTruthy()
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
