// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { HomeBoard } from "@/routes/-components/home-board"
import { NewRoomDialog } from "@/routes/-components/new-room-dialog"
import { AppSection } from "@/components/settings/settings-fields"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { Settings } from "../../../shared/bridge"
import { setLocale, t } from "./index"

afterEach(() => {
  cleanup()
  setLocale("en")
  vi.unstubAllGlobals()
})

function expectDecorated() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const values: string[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.parentElement?.closest("script, style")) continue
    if (node.textContent?.trim()) values.push(node.textContent.trim())
  }
  for (const element of document.querySelectorAll(
    "[aria-label], [title], [placeholder], [alt]"
  )) {
    for (const attr of ["aria-label", "title", "placeholder", "alt"]) {
      const value = element.getAttribute(attr)
      if (value?.trim()) values.push(value.trim())
    }
  }
  // These are user data and the language's own name, rather than UI messages.
  const data = new Set(["English", "Studio"])
  expect(values.length).toBeGreaterThan(5)
  expect(
    values.filter(
      (value) =>
        /\p{L}/u.test(value) && !data.has(value) && !/^\[.*\]$/.test(value)
    )
  ).toEqual([])
}

it("decorates the home board, empty state, join form and accessible text", async () => {
  setLocale("en-XA")
  vi.stubGlobal("tailshare", {
    getRecentRooms: async () => [],
    onRecentRoomsChanged: () => () => {},
  })
  await act(async () =>
    render(
      <HomeBoard
        session={{ state: "idle" }}
        busy={false}
        onCreate={vi.fn()}
        onJoin={vi.fn()}
        onReopen={vi.fn()}
        onOpenRoom={vi.fn()}
      />
    )
  )
  expect(screen.getByText(t("emptyState.shareFilesWithAFriend"))).toBeTruthy()
  expectDecorated()
})

it("decorates the room dialog including its portal and accessible close action", () => {
  setLocale("en-XA")
  render(
    <NewRoomDialog
      open
      onOpenChange={vi.fn()}
      defaultName="Studio"
      busy={false}
      onCreate={vi.fn()}
    />
  )
  expect(
    screen.getByRole("dialog", { name: t("newRoomDialog.nameYourRoom") })
  ).toBeTruthy()
  expectDecorated()
})

it("decorates App settings and their descriptions", () => {
  setLocale("en-XA")
  render(
    <TooltipProvider>
      <AppSection
        settings={
          {
            language: "en",
            theme: "system",
            startWithWindows: false,
            explorerMenu: false,
            closeToTray: true,
            notifications: true,
            mica: false,
          } as Settings
        }
        save={vi.fn()}
        saving={false}
        error=""
        fail={vi.fn()}
      />
    </TooltipProvider>
  )
  expect(
    screen.getByRole("region", { name: t("settingsFields.app") })
  ).toBeTruthy()
  expectDecorated()
})
