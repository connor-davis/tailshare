// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  Settings,
  SettingsPatch,
  TailshareBridge,
} from "../../../../../shared/bridge"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Route } from "../../settings"

const saved: Settings = {
  updateChannel: "latest",
  displayName: "Connor's PC",
  saveMode: "folder",
  saveFolder: "C:\\Users\\Connor\\Downloads\\Tailshare",
  uploadLimitKiB: 0,
  downloadLimitKiB: 512,
  transfersAtOnce: 2,
  startWithWindows: false,
  closeToTray: true,
  mica: true,
}

let pushed: (settings: Settings) => void
const getSettings = vi.fn(async () => saved)
const updateSettings = vi.fn(async (patch: SettingsPatch) => ({
  ...saved,
  ...patch,
}))
const chooseFolder = vi.fn(async (): Promise<string | null> => "D:\\Inbox")

/** Mounts the real settings component under a tiny router. */
async function open() {
  // The real root route provides tooltips to every page.
  const root = createRootRoute({
    component: () => (
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    ),
  })
  const page = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    component: Route.options.component,
  })
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  })

  render(<RouterProvider router={router} />)
  await screen.findByRole("heading", { name: "Settings", level: 1 })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("tailshare", {
    getSettings,
    updateSettings,
    chooseFolder,
    onSettingsChanged: (next: (settings: Settings) => void) => {
      pushed = next
      return () => {}
    },
    getUpdateStatus: async () => ({ state: "current" }),
    onUpdateStatus: () => () => {},
    restartToUpdate: async () => {},
  } as unknown as TailshareBridge)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Settings route", () => {
  it("shows a loading state, then every section", async () => {
    let release: (settings: Settings) => void = () => {}
    getSettings.mockReturnValueOnce(
      new Promise((resolve) => (release = resolve))
    )
    await open()
    expect(screen.getByRole("status").textContent).toContain("Loading")
    act(() => release(saved))

    for (const name of ["You", "Saving", "Transfers", "App", "Updates"])
      expect(await screen.findByRole("region", { name })).toBeTruthy()
  })

  it("says which settings wait for the next update", async () => {
    await open()
    expect(screen.getByRole("note").textContent).toContain(
      "take effect from the next update"
    )
  })

  it("fills the fields from the saved settings", async () => {
    await open()
    expect(
      ((await screen.findByLabelText("Display name")) as HTMLInputElement).value
    ).toBe("Connor's PC")
    expect(
      (screen.getByLabelText("Download limit") as HTMLInputElement).value
    ).toBe("512")
    expect(
      screen
        .getByRole("radio", { name: "Save to folder" })
        .getAttribute("aria-checked")
    ).toBe("true")
    expect(
      screen
        .getByRole("switch", { name: /Close to tray/ })
        .getAttribute("aria-checked")
    ).toBe("true")
    expect(
      screen
        .getByRole("switch", { name: /Start with Windows/ })
        .getAttribute("aria-checked")
    ).toBe("false")
  })

  it("saves a new display name, trimmed, and an empty one means the default", async () => {
    await open()
    const input = await screen.findByLabelText("Display name")
    const button = screen.getByRole("button", { name: "Save name" })
    expect(button.hasAttribute("disabled")).toBe(true)

    fireEvent.change(input, { target: { value: "  Studio  " } })
    fireEvent.click(button)
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ displayName: "Studio" })
    )

    fireEvent.change(await screen.findByLabelText("Display name"), {
      target: { value: "" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save name" }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenLastCalledWith({ displayName: "" })
    )
  })

  it("limits the display name to 64 characters", async () => {
    await open()
    const input = (await screen.findByLabelText(
      "Display name"
    )) as HTMLInputElement
    expect(input.maxLength).toBe(64)
  })

  it("shows an inline alert, and no raw error, when a save is refused", async () => {
    updateSettings.mockRejectedValueOnce(new Error("C:\\secret\\settings.json"))
    await open()
    fireEvent.click(
      await screen.findByRole("switch", { name: /Close to tray/ })
    )

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe(
      "Could not save that. Check the value and try again."
    )
    expect(alert.textContent).not.toContain("secret")
  })

  it("clears the alert on the next successful save", async () => {
    updateSettings.mockRejectedValueOnce(new Error("no"))
    await open()
    const toggle = await screen.findByRole("switch", {
      name: /Mica|Background/,
    })
    fireEvent.click(toggle)
    await screen.findByRole("alert")
    fireEvent.click(screen.getByRole("switch", { name: /Background/ }))
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })

  it("switches the save mode and hides the folder for Ask every time", async () => {
    await open()
    expect(await screen.findByText(saved.saveFolder)).toBeTruthy()

    fireEvent.click(screen.getByRole("radio", { name: "Ask every time" }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ saveMode: "ask" })
    )
    await waitFor(() => expect(screen.queryByText(saved.saveFolder)).toBeNull())
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull()
  })

  it("changes the save folder with the folder picker", async () => {
    await open()
    fireEvent.click(await screen.findByRole("button", { name: "Change" }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ saveFolder: "D:\\Inbox" })
    )
    expect(chooseFolder).toHaveBeenCalledOnce()
  })

  it("leaves the folder alone when the picker is cancelled", async () => {
    chooseFolder.mockResolvedValueOnce(null)
    await open()
    fireEvent.click(await screen.findByRole("button", { name: "Change" }))
    await waitFor(() => expect(chooseFolder).toHaveBeenCalledOnce())
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it("saves the three transfer values together", async () => {
    await open()
    fireEvent.change(await screen.findByLabelText("Upload limit"), {
      target: { value: "256" },
    })
    fireEvent.change(screen.getByLabelText("Transfers at once"), {
      target: { value: "4" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save transfers" }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        uploadLimitKiB: 256,
        downloadLimitKiB: 512,
        transfersAtOnce: 4,
      })
    )
  })

  it("refuses bad transfer values on the page, with a reason", async () => {
    await open()
    const slots = await screen.findByLabelText("Transfers at once")
    const save = screen.getByRole("button", { name: "Save transfers" })

    for (const bad of ["0", "9", "2.5", "", "abc"]) {
      fireEvent.change(slots, { target: { value: bad } })
      expect(slots.getAttribute("aria-invalid")).toBe("true")
      expect(save.hasAttribute("disabled")).toBe(true)
    }

    fireEvent.change(screen.getByLabelText("Upload limit"), {
      target: { value: "1048577" },
    })
    expect(
      screen.getByLabelText("Upload limit").getAttribute("aria-invalid")
    ).toBe("true")
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it("flips each app switch with its own patch", async () => {
    await open()
    fireEvent.click(await screen.findByRole("switch", { name: /Start with/ }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenLastCalledWith({
        startWithWindows: true,
      })
    )
    fireEvent.click(screen.getByRole("switch", { name: /Close to tray/ }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenLastCalledWith({ closeToTray: false })
    )
    fireEvent.click(screen.getByRole("switch", { name: /Background effect/ }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenLastCalledWith({ mica: false })
    )
  })

  it("follows a change pushed from the app", async () => {
    await open()
    await screen.findByLabelText("Display name")
    act(() => pushed({ ...saved, displayName: "Pushed", closeToTray: false }))

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Display name") as HTMLInputElement).value
      ).toBe("Pushed")
    )
    expect(
      screen
        .getByRole("switch", { name: /Close to tray/ })
        .getAttribute("aria-checked")
    ).toBe("false")
  })

  it("keeps the Updates section here, with its channel choice", async () => {
    await open()
    const updates = await screen.findByRole("region", { name: "Updates" })
    expect(updates.textContent).toContain("Release channel")
    expect(updates.textContent).toContain("Stable")
  })

  it("says so, in words, when the settings cannot load", async () => {
    getSettings.mockRejectedValueOnce(new Error("private path"))
    await open()
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Could not load your settings")
    expect(alert.textContent).not.toContain("private")
    expect(screen.queryByRole("region", { name: "You" })).toBeNull()
  })
})
