// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SessionState } from "@/lib/api/types"
import { Route } from "../index"

const mocks = vi.hoisted(() => ({
  hostMutate: vi.fn(),
  joinMutate: vi.fn(),
  announce: vi.fn(),
  leaveMutate: vi.fn(),
  activateMutate: vi.fn(),
  joinError: null as Error | null,
}))
const { hostMutate, joinMutate } = mocks
let session: SessionState | undefined = { state: "idle" }
let joinLink: (code: string) => void = () => {}

vi.mock("@/lib/api/session", () => {
  const action = (mutate: () => void) => () => ({
    mutate,
    isPending: false,
    error: null,
  })

  return {
    useSession: () => ({ data: session }),
    useRooms: () => ({
      data: {
        active: session?.room ?? "",
        rooms: session?.room ? [session] : [],
      },
    }),
    useActivateRoom: action(mocks.activateMutate),
    useHost: action(mocks.hostMutate),
    useJoin: () => ({
      mutate: mocks.joinMutate,
      isPending: false,
      error: mocks.joinError,
    }),
    useLeave: action(mocks.leaveMutate),
    useRemoveMember: action(vi.fn()),
    useAllowJoin: action(vi.fn()),
    useDenyJoin: action(vi.fn()),
    useTrustJoin: action(vi.fn()),
  }
})
vi.mock("@/components/status-region", () => ({ announce: mocks.announce }))
vi.mock("@/lib/api/forwards", () => ({
  useForwards: () => ({ data: [], isLoading: false }),
  useShareApp: () => ({ mutate: vi.fn(), isPending: false }),
  useStopApp: () => ({ mutate: vi.fn(), isPending: false }),
  useOpenApp: () => ({ mutate: vi.fn(), isPending: false }),
  useCloseApp: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/lib/api/transfers", () => ({
  useTransfers: () => ({ data: [] }),
  useClearTransfers: () => ({ mutate: vi.fn(), isPending: false }),
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
  RoomSidebar: ({ onHome }: { onHome: () => void }) => (
    <aside aria-label="Rooms">
      <button onClick={onHome}>Home</button>
    </aside>
  ),
}))

const openRoomFolder = vi.fn(async () => {})
const getCurrentRoom = vi.fn(async () => null as unknown)
const setCurrentRoom = vi.fn(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  session = { state: "idle" }
  mocks.joinError = null
  vi.stubGlobal("tailshare", {
    onJoinLink: (listener: (code: string) => void) => {
      joinLink = listener

      return () => {}
    },
    getRecentRooms: async () => [],
    onRecentRoomsChanged: () => () => {},
    touchRecentRoom: async () => {},
    openRoomFolder,
    getCurrentRoom,
    setCurrentRoom,
    getDownloadsStatus: async () => ({ ok: true }),
    onDownloadsStatus: () => () => {},
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
  it("shows the home board and an update slot when idle", () => {
    shell()

    expect(
      screen.getByRole("heading", { name: "Share files with a friend" })
    ).toBeTruthy()
    expect(screen.getByLabelText("Join with a code or link")).toBeTruthy()
    expect(screen.getByText("update slot")).toBeTruthy()
    expect(screen.getByRole("region", { name: "Your rooms" })).toBeTruthy()
    expect(screen.queryByRole("complementary", { name: "Members" })).toBeNull()
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
    for (const name of ["Files", "People", "Chat", "Transfers", "Apps"]) {
      expect(
        screen.getByRole("button", { name: `Expand ${name}` })
      ).toBeTruthy()
    }
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
    expect(screen.getByRole("region", { name: "Transfer list" })).toBeTruthy()
    expect(screen.getByText("Host")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Leave" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Expand Chat" })).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Expand Transfers" })
    ).toBeTruthy()
  })

  it("ignores retired transfer visibility and uses only tile expansion", () => {
    window.localStorage.setItem("tailshare.layout.transfers.open", "false")
    session = {
      state: "connected",
      role: "joiner",
      peer: { displayName: "Pat" },
    }
    shell()
    expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull()
    expect(screen.getByRole("region", { name: "Transfer list" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Expand Transfers" }))
    expect(screen.getByRole("region", { name: "Transfer list" })).toBeTruthy()
    expect(window.localStorage.getItem("tailshare.layout.transfers.open")).toBe(
      "false"
    )
  })

  it("keeps the room draft while visiting Home and returning", () => {
    session = { state: "connected", role: "host", peer: { displayName: "Pat" } }
    shell()
    const draft = screen.getByLabelText("Message") as HTMLTextAreaElement
    fireEvent.change(draft, { target: { value: "Keep my draft" } })
    fireEvent.click(screen.getByRole("button", { name: "Home" }))
    expect(
      screen.getByRole("heading", { name: "Share files with a friend" })
    ).toBeTruthy()
    expect(screen.queryByRole("log", { name: "Chat messages" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Open room" }))
    expect(screen.getByLabelText("Message")).toBe(draft)
    expect(draft.value).toBe("Keep my draft")
  })

  it("joins when a tailshare link arrives", async () => {
    shell()

    joinLink("7K3Q9PXM")

    await waitFor(() =>
      expect(joinMutate).toHaveBeenCalledWith("7K3Q9PXM", expect.anything())
    )
  })

  it("holds a link that arrives before the session is known, then joins once", async () => {
    session = undefined
    const view = shell()

    joinLink("7K3Q9PXM")
    expect(joinMutate).not.toHaveBeenCalled()

    session = { state: "idle" }
    view.rerender(<TooltipProvider>{shellNode()}</TooltipProvider>)
    view.rerender(<TooltipProvider>{shellNode()}</TooltipProvider>)

    await waitFor(() => expect(joinMutate).toHaveBeenCalledOnce())
    expect(joinMutate).toHaveBeenCalledWith("7K3Q9PXM", expect.anything())
  })

  it("joins a held link while another room is open", () => {
    session = undefined
    const view = shell()
    joinLink("7K3Q9PXM")

    session = { state: "hosting", role: "host", code: "ABCD2345" }
    view.rerender(<TooltipProvider>{shellNode()}</TooltipProvider>)

    expect(joinMutate).toHaveBeenCalledWith("7K3Q9PXM", expect.anything())
  })

  it("keeps People and approval visible despite retired member visibility", () => {
    window.localStorage.setItem("tailshare.layout.members.open", "false")
    session = {
      state: "hosting",
      role: "host",
      code: "7K3Q9PXM",
      join: { id: 1, displayName: "Pat" },
    }
    shell()
    const people = screen.getByRole("region", { name: "People" })
    expect(
      within(people).getAllByText("Someone wants to join").length
    ).toBeGreaterThan(0)
    expect(within(people).getByRole("button", { name: "Allow" })).toBeTruthy()
    expect(within(people).getByRole("button", { name: "Deny" })).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: /Show or hide members/ })
    ).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Home" }))
    expect(screen.getByRole("button", { name: "Allow" })).toBeTruthy()
    expect(window.localStorage.getItem("tailshare.layout.members.open")).toBe(
      "false"
    )
  })

  it("gets the room folder and share code back after a page reload", async () => {
    getCurrentRoom.mockResolvedValue({ name: "Movie night", code: "7K3Q9PXM" })
    session = { state: "connected", role: "host", peer: { displayName: "Pat" } }
    shell()

    const open = await screen.findByRole("button", { name: "Open folder" })
    fireEvent.click(open)

    expect(openRoomFolder).toHaveBeenCalledWith("7K3Q9PXM")
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy()
  })

  it("tells main about the room it opens and when it ends", async () => {
    session = { state: "hosting", role: "host", code: "7K3Q9PXM" }
    const view = shell()

    await waitFor(() =>
      expect(setCurrentRoom).toHaveBeenCalledWith({
        name: "",
        code: "7K3Q9PXM",
      })
    )

    session = { state: "idle" }
    view.rerender(<TooltipProvider>{shellNode()}</TooltipProvider>)
    await waitFor(() => expect(setCurrentRoom).toHaveBeenLastCalledWith(null))
  })

  it("remembers only the rail toggle and keeps People in the board", () => {
    session = { state: "hosting", role: "host", code: "7K3Q9PXM" }
    const view = shell()
    fireEvent.click(screen.getByRole("button", { name: "Show or hide rooms" }))
    expect(screen.queryByRole("complementary", { name: "Rooms" })).toBeNull()
    expect(screen.getByRole("complementary", { name: "Members" })).toBeTruthy()
    expect(window.localStorage.getItem("tailshare.layout.rooms.open")).toBe(
      "false"
    )
    view.unmount()
    shell()
    expect(screen.queryByRole("complementary", { name: "Rooms" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show or hide rooms" }))
    expect(screen.getByRole("complementary", { name: "Rooms" })).toBeTruthy()
  })

  it("announces the notice when the other computer leaves", () => {
    session = {
      state: "connected",
      role: "joiner",
      peer: { displayName: "Pat" },
    }
    const view = shell()

    session = { state: "idle" }
    view.rerender(<TooltipProvider>{shellNode()}</TooltipProvider>)

    expect(mocks.announce).toHaveBeenCalledWith(
      "The other computer left the room."
    )
    expect(screen.getByRole("status").textContent).toContain(
      "The other computer left the room."
    )
  })

  it("announces who joined and left, and stays silent at first", () => {
    const you = { id: "a", displayName: "Studio", host: true, you: true }
    const pat = { id: "b", displayName: "Pat" }
    session = {
      state: "hosting",
      role: "host",
      code: "7K3Q9PXM",
      members: [you, pat],
    }
    const view = shell()
    const names = () => mocks.announce.mock.calls.map((call) => call[0])

    expect(names().filter((text) => /joined|left/.test(text))).toEqual([])

    session = {
      state: "hosting",
      role: "host",
      code: "7K3Q9PXM",
      members: [you, pat, { id: "c", displayName: "Kim" }],
    }
    view.rerender(<TooltipProvider>{shellNode()}</TooltipProvider>)
    expect(names()).toContain("Kim joined.")

    session = {
      state: "hosting",
      role: "host",
      code: "7K3Q9PXM",
      members: [you, pat],
    }
    view.rerender(<TooltipProvider>{shellNode()}</TooltipProvider>)
    expect(names()).toContain("Kim left.")
  })

  it("shows a failed join with the alert role", () => {
    mocks.joinError = new Error("That code did not work.")
    shell()

    expect(screen.getByRole("alert").textContent).toContain(
      "That code did not work."
    )
  })

  it("keeps the 138 px caption corner empty on the rightmost bar", () => {
    shell()
    const bars = screen.getAllByRole("banner")

    // Only the app toolbar reserves the native caption corner.
    expect(
      bars.filter((bar) => bar.className.includes("pr-[138px]"))
    ).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Show or hide rooms" }))
    expect(
      screen
        .getAllByRole("banner")
        .filter((bar) => bar.className.includes("pr-[138px]"))
    ).toHaveLength(1)
  })
})

it("switches to a room already opened by a deep link", () => {
  session = {
    state: "hosting",
    role: "host",
    room: "7K3Q-9PXM",
    code: "7K3Q-9PXM",
  }
  shell()
  act(() => joinLink("7K3Q9PXM"))
  expect(mocks.activateMutate).toHaveBeenCalledWith(
    "7K3Q9PXM",
    expect.anything()
  )
  expect(joinMutate).not.toHaveBeenCalled()
})

it("syncs main to each selected room and leaves with the selected code", async () => {
  session = {
    state: "hosting",
    role: "host",
    room: "7K3Q-9PXM",
    roomName: "First",
  }
  const view = shell()
  await waitFor(() =>
    expect(setCurrentRoom).toHaveBeenLastCalledWith({
      name: "First",
      code: "7K3Q-9PXM",
    })
  )
  session = {
    state: "hosting",
    role: "host",
    room: "8K3Q-9PXM",
    roomName: "Second",
  }
  view.rerender(<TooltipProvider>{shellNode()}</TooltipProvider>)
  await waitFor(() =>
    expect(setCurrentRoom).toHaveBeenLastCalledWith({
      name: "Second",
      code: "8K3Q-9PXM",
    })
  )
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(mocks.leaveMutate).toHaveBeenCalledWith("8K3Q-9PXM", expect.anything())
})
