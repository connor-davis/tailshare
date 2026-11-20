import { useRef, useState } from "react"
import { useSettings } from "@/components/settings/use-settings"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Your display name in the sidebar footer. Click to edit; Enter or leaving
 * the field saves, Esc cancels. It saves through the same settings call as
 * the Settings dialog, so the rules and the error sentence are the same.
 */
export function NameEditor() {
  const { settings, error, save } = useSettings()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState("")
  // Esc ends the edit, and the blur that follows must not save it.
  const cancelled = useRef(false)

  const finish = () => {
    if (cancelled.current) return

    setEditing(false)
    const name = text.trim()
    if (settings && name !== settings.displayName)
      void save({ displayName: name })
  }

  if (!settings) return <p className="min-w-0 flex-1 truncate">…</p>

  if (editing) {
    return (
      <div className="min-w-0 flex-1">
        <Input
          autoFocus
          aria-label="Display name"
          value={text}
          maxLength={64}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === "Enter") finish()
            if (event.key === "Escape") {
              cancelled.current = true
              setEditing(false)
            }
          }}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-w-0 flex-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-accent/60"
            aria-label={`Display name: ${settings.displayName}. Click to edit.`}
            onClick={() => {
              cancelled.current = false
              setText(settings.displayName)
              setEditing(true)
            }}
          >
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
              {Array.from(settings.displayName)[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {settings.displayName}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          Click to change. Your name takes effect from the next update.
        </TooltipContent>
      </Tooltip>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
