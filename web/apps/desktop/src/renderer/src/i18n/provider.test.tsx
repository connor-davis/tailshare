// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { LocaleProvider, useLocale, useT } from "./provider"
import { setLocale } from "./index"
import type { Settings } from "../../../shared/bridge"

afterEach(() => {
  cleanup()
  setLocale("en")
  vi.unstubAllGlobals()
})

it("updates mounted UI text live when main broadcasts a language change", async () => {
  let pushed!: (settings: Settings) => void
  vi.stubGlobal("tailshare", {
    onSettingsChanged: (listener: typeof pushed) => {
      pushed = listener
      return () => {}
    },
    getSettings: async () => ({ language: "en" }) as Settings,
  })
  function Label() {
    return <p>{useT()("language.label")}</p>
  }
  render(
    <LocaleProvider>
      <Label />
    </LocaleProvider>
  )
  await screen.findByText("Language")
  act(() => pushed({ language: "es" } as Settings))
  expect(screen.getByText("Idioma")).toBeTruthy()
  act(() => pushed({ language: "ar" } as Settings))
  expect(screen.getByText("اللغة")).toBeTruthy()
})

it("follows main settings and ignores an older initial read after a push", async () => {
  let pushed!: (settings: Settings) => void
  let resolve!: (settings: Settings) => void
  const unsubscribe = vi.fn()
  vi.stubGlobal("tailshare", {
    onSettingsChanged: (listener: typeof pushed) => {
      pushed = listener
      return unsubscribe
    },
    getSettings: () =>
      new Promise<Settings>((done) => {
        resolve = done
      }),
  })

  function CurrentLocale() {
    return <p>{useLocale()}</p>
  }
  const view = render(
    <LocaleProvider>
      <CurrentLocale />
    </LocaleProvider>
  )
  act(() => pushed({ language: "de" } as Settings))
  expect(screen.getByText("de")).toBeTruthy()
  await act(async () => resolve({ language: "fr" } as Settings))
  expect(screen.getByText("de")).toBeTruthy()
  view.unmount()
  await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce())
})
