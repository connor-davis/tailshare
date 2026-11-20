import { useState } from "react"
import { Input } from "@/components/ui/input"
import {
  cleanCode,
  CODE_LENGTH,
  formatCode,
  hasBadCharacter,
} from "@/lib/code-input"

/** What the field says when the code can't be right. */
export const CODE_HINT = "Codes are 8 letters or numbers, like 7K3Q-9PXM."

/** Whether a typed code is wrong enough to say so now. */
export function codeProblem(code: string, blurred: boolean): boolean {
  if (code === "") return false

  return hasBadCharacter(code) || (blurred && code.length < CODE_LENGTH)
}

/**
 * One input for the share code. It shows `7K3Q-9PXM` while the value stays eight
 * plain characters, and reads O, I and L as 0, 1 and 1.
 */
export function CodeInput({
  value,
  onChange,
  disabled,
  describedBy,
}: {
  /** The code without its dash. */
  value: string
  /** Called with the tidied code. */
  onChange: (code: string) => void
  /** True while a connection is being made. */
  disabled?: boolean
  /** Id of the element that explains an error. */
  describedBy?: string
}) {
  const [blurred, setBlurred] = useState(false)
  const invalid = codeProblem(value, blurred)

  return (
    <>
      <Input
        id="join-code"
        value={formatCode(value)}
        onChange={(event) => onChange(cleanCode(event.target.value))}
        onBlur={() => setBlurred(true)}
        maxLength={CODE_LENGTH + 1}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={invalid ? describedBy : undefined}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="7K3Q-9PXM"
        className="h-9 font-mono text-lg tracking-widest"
      />
      {invalid ? (
        <p id={describedBy} className="text-sm text-destructive">
          {CODE_HINT}
        </p>
      ) : null}
    </>
  )
}
