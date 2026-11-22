// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { SettingsLanguage } from "./settings-language"
import type { Settings } from "../../../../shared/bridge"

afterEach(cleanup)

it("offers all five native names, excludes the pseudo-locale, and saves Arabic", async () => {
  const save = vi.fn(async () => true)
  render(
    <SettingsLanguage
      settings={{ language: "fr" } as Settings}
      save={save}
      saving={false}
    />
  )
  const picker = screen.getByRole("combobox", { name: "Language" })
  expect(picker.textContent).toBe("Français")
  fireEvent.keyDown(picker, { key: "ArrowDown" })
  const options = await screen.findAllByRole("option")
  expect(options.map((option) => option.textContent)).toEqual([
    "English",
    "Español",
    "Français",
    "Deutsch",
    "العربية",
  ])
  fireEvent.click(screen.getByRole("option", { name: "العربية" }))
  expect(save).toHaveBeenCalledWith({ language: "ar" })
})
