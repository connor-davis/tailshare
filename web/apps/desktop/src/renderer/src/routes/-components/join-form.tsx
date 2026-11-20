import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { codeFromInput } from "@/lib/code-input"

/**
 * One box to join with a code or a pasted tailshare:// link, and a Join
 * button on the same row. Used by the empty screen and the Join dialog.
 */
export function JoinForm({
  id,
  enabled,
  busy,
  onJoin,
}: {
  /** Unique id for the input, so its label names it. */
  id: string
  /** False until a folder is chosen, or while another room is open. */
  enabled: boolean
  /** True while a host or join is running. */
  busy: boolean
  /** Joins with the bare code. */
  onJoin: (code: string) => void
}) {
  const [text, setText] = useState("")
  const [blurred, setBlurred] = useState(false)
  const code = codeFromInput(text)
  const problem = blurred && text.trim() !== "" && code === null

  return (
    <form
      className="flex w-full flex-col gap-2 text-left"
      onSubmit={(event) => {
        event.preventDefault()
        if (code && enabled && !busy) onJoin(code)
      }}
    >
      <Label htmlFor={id}>Join with a code or link</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => setBlurred(true)}
          placeholder="7K3Q-9PXM or tailshare://join/…"
          aria-invalid={problem}
          aria-describedby={problem ? `${id}-hint` : undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={!enabled || busy}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!enabled || busy || code === null}
        >
          Join
        </Button>
      </div>
      {problem ? (
        <p id={`${id}-hint`} className="text-sm text-destructive">
          Codes are 8 letters or numbers, like 7K3Q-9PXM.
        </p>
      ) : null}
    </form>
  )
}
