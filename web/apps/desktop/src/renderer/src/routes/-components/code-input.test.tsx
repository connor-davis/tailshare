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
  it("shows 7K3-Q9P for 7k3q9p", () => {
    render(<Harness />)

    type("7k3q9p")

    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "7K3-Q9P"
    )
    expect(joinDisabled()).toBe(false)
  })

  it("keeps Join disabled at five characters", () => {
    render(<Harness />)

    type("7k3q9")

    expect(joinDisabled()).toBe(true)
  })

  it("says what a code looks like when a letter can never be right", () => {
    render(<Harness />)

    type("U9")

    expect(screen.getByText(/Codes are 6 letters or numbers/)).toBeTruthy()
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe(
      "true"
    )
  })
})
