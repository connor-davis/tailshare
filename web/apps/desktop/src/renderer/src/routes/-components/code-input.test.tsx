// @vitest-environment jsdom
import { useState } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Button } from "@/components/ui/button"
import { foldCode } from "@/lib/code-input"
import { CodeInput } from "./code-input"

afterEach(cleanup)

function Harness() {
  const [code, setCode] = useState("")

  return (
    <>
      <CodeInput value={code} onChange={setCode} describedBy="hint" />
      <Button disabled={foldCode(code) === null}>Join</Button>
    </>
  )
}

function type(value: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } })
}

const joinDisabled = () =>
  (screen.getByRole("button") as HTMLButtonElement).disabled

describe("CodeInput", () => {
  it.each(["7k3q9pxm", "7K3Q-9PXM"])("formats pasted code %s", (raw) => {
    render(<Harness />)

    type(raw)

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "7K3Q-9PXM"
    )
    expect(joinDisabled()).toBe(false)
    expect((screen.getByRole("textbox") as HTMLInputElement).maxLength).toBe(9)
  })

  it("keeps Join disabled at seven characters", () => {
    render(<Harness />)

    type("7k3q9px")

    expect(joinDisabled()).toBe(true)
  })

  it("says what a code looks like when a letter can never be right", () => {
    render(<Harness />)

    type("U9")

    expect(screen.getByText(/Codes are 8 letters or numbers/)).toBeTruthy()
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe(
      "true"
    )
  })
})
