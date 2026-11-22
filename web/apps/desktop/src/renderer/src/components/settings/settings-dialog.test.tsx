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
import type {
  Settings,
  SettingsPatch,
  TailshareBridge,
} from "../../../../shared/bridge"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SettingsDialogProvider, useOpenSettings } from "./settings-dialog"

const saved: Settings = {
  language: "en",
  relayRegion: "303",
  notifications: true,
  updateChannel: "latest",
  displayName: "Connor's PC",
  saveMode: "folder",
  saveFolder: "C:\\Users\\Connor\\Downloads\\Tailshare",
  uploadLimitKiB: 0,
  downloadLimitKiB: 512,
  transfersAtOnce: 2,
  startWithWindows: false,
  explorerMenu: true,
  closeToTray: true,
  mica: true,
  theme: "system",
  trustedComputers: [],
}

let pushed: (settings: Settings) => void
const getSettings = vi.fn(async () => saved)
const updateSettings = vi.fn(async (patch: SettingsPatch) => ({
  ...saved,
  ...patch,
}))
const chooseFolder = vi.fn(async (): Promise<string | null> => "D:\\Inbox")

/** A stand-in for the gear buttons. */
function Gear() {
  const openSettings = useOpenSettings()

  return (
    <button aria-label="Settings" onClick={openSettings}>
      gear
    </button>
  )
}

/** Opens the real dialog from a gear, then the section named (You is first). */
async function open(section?: string) {
  render(
    <TooltipProvider>
      <SettingsDialogProvider>
        <Gear />
      </SettingsDialogProvider>
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole("button", { name: "Settings" }))
  await screen.findByRole("dialog", { name: "Settings" })
  if (section) fireEvent.click(screen.getByRole("button", { name: section }))
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

describe("Settings dialog", () => {
  it("opens from the gear, shows a loading state, then the You section", async () => {
    let release: (settings: Settings) => void = () => {}
    getSettings.mockReturnValueOnce(
      new Promise((resolve) => (release = resolve))
    )
    await open()
    expect(screen.getByRole("status").textContent).toContain("Loading")
    act(() => release(saved))

    expect(await screen.findByRole("region", { name: "You" })).toBeTruthy()
  })

  it("closes with Escape and with the X", async () => {
    await open()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    await screen.findByRole("dialog")
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("switches sections from the left menu", async () => {
    await open()
    await screen.findByRole("region", { name: "You" })

    for (const name of ["Saving", "Transfers", "App", "Updates", "You"]) {
      fireEvent.click(screen.getByRole("button", { name }))
      expect(await screen.findByRole("region", { name })).toBeTruthy()
      expect(
        screen.getByRole("button", { name }).getAttribute("aria-current")
      ).toBe("page")
    }
  })

  it("says which settings wait for the next update", async () => {
    await open()
    expect(screen.getByRole("dialog").textContent).toContain(
      "take effect from the next update"
    )
  })

  it("fills the fields from the saved settings", async () => {
    await open()
    expect(
      ((await screen.findByLabelText("Display name")) as HTMLInputElement).value
    ).toBe("Connor's PC")

    fireEvent.click(screen.getByRole("button", { name: "Saving" }))
    expect(await screen.findByText(saved.saveFolder)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Transfers" }))
    expect(
      ((await screen.findByLabelText("Download limit")) as HTMLInputElement)
        .value
    ).toBe("512")

    fireEvent.click(screen.getByRole("button", { name: "App" }))
    expect(
      (
        await screen.findByRole("switch", { name: /Close to tray/ })
      ).getAttribute("aria-checked")
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
    await open("App")
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
    await open("App")
    fireEvent.click(await screen.findByRole("switch", { name: /Background/ }))
    await screen.findByRole("alert")
    fireEvent.click(screen.getByRole("switch", { name: /Background/ }))
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })

  it("shows the save folder and an Ask every time option that saves", async () => {
    await open("Saving")

    expect(await screen.findByText(saved.saveFolder)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: /Ask every time/ }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ saveMode: "ask" })
    )
  })

  it("changes the save folder with the folder picker", async () => {
    await open("Saving")
    fireEvent.click(await screen.findByRole("button", { name: "Change" }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ saveFolder: "D:\\Inbox" })
    )
    expect(chooseFolder).toHaveBeenCalledOnce()
  })

  it("leaves the folder alone when the picker is cancelled", async () => {
    chooseFolder.mockResolvedValueOnce(null)
    await open("Saving")
    fireEvent.click(await screen.findByRole("button", { name: "Change" }))
    await waitFor(() => expect(chooseFolder).toHaveBeenCalledOnce())
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it("saves the three transfer values together", async () => {
    await open("Transfers")
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

  it("refuses bad transfer values in the dialog, with a reason", async () => {
    await open("Transfers")
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
    await open("App")
    fireEvent.click(await screen.findByRole("switch", { name: /Start with/ }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenLastCalledWith({
        startWithWindows: true,
      })
    )
    fireEvent.click(screen.getByRole("switch", { name: /Send from Explorer/ }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenLastCalledWith({ explorerMenu: false })
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

  it("saves the chosen appearance", async () => {
    await open("App")
    fireEvent.click(await screen.findByRole("radio", { name: "Dark" }))
    await waitFor(() =>
      expect(updateSettings).toHaveBeenLastCalledWith({ theme: "dark" })
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
    fireEvent.click(screen.getByRole("button", { name: "App" }))
    expect(
      (
        await screen.findByRole("switch", { name: /Close to tray/ })
      ).getAttribute("aria-checked")
    ).toBe("false")
  })

  it("keeps the Updates section here, with its channel choice", async () => {
    await open("Updates")
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

describe("Settings dialog layout for RTL", () => {
  it("uses logical edges for the section list and content padding", async () => {
    await open()
    const dialog = screen.getByRole("dialog", { name: "Settings" })
    const nav = dialog.querySelector("nav")!
    const item = screen.getByRole("button", { name: "You" })

    expect(nav.className).toContain("border-e")
    expect(nav.className).not.toContain("border-r")
    expect(item.className).toContain("text-start")
    expect(item.className).not.toContain("text-left")
    expect(dialog.innerHTML).toContain("pe-10")
    expect(dialog.innerHTML).not.toMatch(/(?<![\w-])pr-/)
    const close = screen.getByRole("button", { name: "Close" })
    expect(close.className).toContain("end-3")
  })
})
