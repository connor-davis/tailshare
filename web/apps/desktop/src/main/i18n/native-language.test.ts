import { afterEach, expect, it, vi } from "vitest"
import { LANGUAGES } from "../../shared/i18n"
import { setMainLocale, t } from "./index"
import { catalogs } from "./catalogs"
import { applyExplorerMenu } from "../explorer-menu"
import { toastText } from "../notify"

vi.mock("electron", () => ({}))
const { trayMenuTemplate } = await import("../tray")

afterEach(() => setMainLocale("en"))

it.each(LANGUAGES)(
  "uses %s immediately for tray, toast and Explorer labels",
  async (language) => {
    setMainLocale(language)
    const [open, , quit] = trayMenuTemplate({
      onOpen: vi.fn(),
      onQuit: vi.fn(),
    })
    expect(open?.label).toBe(catalogs[language]["tray.openTailshare"])
    expect(quit?.label).toBe(catalogs[language]["tray.quit"])
    expect(toastText("join", "Hana").body).toBe(
      t("notify.joinRequest", { name: "Hana" })
    )

    const run = vi.fn<(args: string[]) => Promise<void>>(async () => {})
    await applyExplorerMenu(true, {
      packaged: true,
      execPath: "C:\\Tailshare.exe",
      run,
    })
    const labels = run.mock.calls
      .map(([args]) => args)
      .filter((args) => !args[1]?.endsWith("\\command"))
    expect(labels).toHaveLength(2)
    for (const args of labels)
      expect(args).toContain(
        catalogs[language]["explorerMenu.sendWithTailshare"]
      )
  }
)

it("switches existing translator calls without restarting main", () => {
  setMainLocale("es")
  expect(t("tray.quit")).toBe("Salir")
  setMainLocale("ar")
  expect(t("tray.quit")).toBe("إنهاء")
})
