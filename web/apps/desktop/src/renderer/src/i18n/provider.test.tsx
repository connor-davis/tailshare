// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { LocaleProvider, useLocale } from "./provider"
import { setLocale } from "./index"
import type { Settings } from "../../../shared/bridge"

afterEach(() => {
  cleanup()
  setLocale("en")
  vi.unstubAllGlobals()
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
