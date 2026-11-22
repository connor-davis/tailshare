// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SessionState } from "@/lib/api/types"
import { RoomSidebar } from "../routes/-components/room-sidebar"
import { RoomView } from "../routes/-components/room-view"
import { ShareCode } from "../routes/-components/share-code"
import { setLocale } from "./index"
import { LocaleProvider } from "./provider"

vi.mock("@/components/settings/settings-dialog", () => ({
  useOpenSettings: () => vi.fn(),
}))
vi.mock("../routes/-components/room-header", () => ({
  RoomHeader: () => <header>Room header</header>,
}))
vi.mock("../routes/-components/room-chat", () => ({ RoomChat: () => <p /> }))
vi.mock("../routes/-components/room-files", () => ({ RoomFiles: () => <p /> }))
vi.mock("../routes/-components/members-panel", () => ({
  MembersPanel: () => <p />,
}))
vi.mock("../routes/-components/apps-panel", () => ({ AppsPanel: () => <p /> }))
vi.mock("../routes/-components/transfers-panel", () => ({
  TransfersPanel: () => <p />,
}))

beforeEach(() => {
  vi.stubGlobal("tailshare", {
    getSettings: async () => ({ displayName: "Studio PC", language: "en" }),
    updateSettings: async () => ({}),
    onSettingsChanged: () => () => {},
    getRecentRooms: async () => [
      { name: "غرفة Pat", code: "7K3Q9PXM", lastSeen: Date.now() },
    ],
    onRecentRoomsChanged: () => () => {},
    removeRecentRoom: async () => {},
  })
})
afterEach(() => {
  cleanup()
  setLocale("en")
  vi.unstubAllGlobals()
})

const connected: SessionState = {
  state: "connected",
  role: "joiner",
  roomName: "Pat's room",
  peer: { displayName: "Pat", sharedFolderName: "Photos" },
  members: [{ id: "a", displayName: "Pat", host: true }],
}

it("sets the document lang and dir from the locale", async () => {
  render(<LocaleProvider>{null}</LocaleProvider>)
  expect(document.documentElement.dir).toBe("ltr")

  act(() => setLocale("ar"))
  expect(document.documentElement.lang).toBe("ar")
  expect(document.documentElement.dir).toBe("rtl")

  act(() => setLocale("fr"))
  expect(document.documentElement.lang).toBe("fr")
  expect(document.documentElement.dir).toBe("ltr")
})

it("keeps the rail search and room names logical and isolated", async () => {
  const { container } = render(
    <TooltipProvider>
      <RoomSidebar
        session={connected}
        busy={false}
        onNewRoom={vi.fn()}
        onJoin={vi.fn()}
        onRejoin={vi.fn()}
        onReopen={vi.fn()}
      />
    </TooltipProvider>
  )
  const search = container.querySelector('input[type="search"]')!
  const icon = search.parentElement!.querySelector("svg")!

  expect(search.className).toContain("ps-8")
  expect(search.className).not.toContain("pl-8")
  expect(icon.getAttribute("class")).toContain("start-2.5")
  expect(icon.getAttribute("class")).not.toContain("left-2.5")
  expect(container.querySelector("bdi")?.textContent).toBe("Pat's room")
  const recent = await screen.findByText("غرفة Pat")
  expect(recent.getAttribute("dir")).toBe("auto")
})

it("lays the room board titles out with logical spacing", () => {
  render(
    <RoomView
      session={{ state: "hosting" }}
      onLeave={vi.fn()}
      leaving={false}
    />
  )
  const title = document.getElementById("tile-Files")!

  expect(title.className).toContain("me-auto")
  expect(title.className).not.toContain("mr-auto")
})

it("always draws the share code left to right", () => {
  render(<ShareCode code="7K3Q9PXM" />)

  expect(screen.getByText("7K3Q-9PXM").getAttribute("dir")).toBe("ltr")
})
