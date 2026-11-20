import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** The longest room name the sidecar accepts. */
const maxRoomName = 64

/**
 * A small dialog that names a room before it is created. The box starts with
 * "<your name>'s room"; a blank box lets the sidecar pick that same name.
 */
export function NewRoomDialog({
  open,
  onOpenChange,
  defaultName,
  busy,
  onCreate,
}: {
  /** True while the dialog is shown. */
  open: boolean
  /** Called when the dialog asks to open or close. */
  onOpenChange: (open: boolean) => void
  /** What the box starts with, such as "Hana's room". */
  defaultName: string
  /** True while a host or join is running. */
  busy: boolean
  /** Creates the room with the trimmed name; blank means the default. */
  onCreate: (name: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 p-6">
        <DialogTitle>Name your room</DialogTitle>
        <DialogDescription>
          Everyone who joins sees this name.
        </DialogDescription>
        {/* Mounted only while open, so the box starts fresh every time. */}
        <form
          className="flex flex-col gap-4 text-left"
          onSubmit={(event) => {
            event.preventDefault()
            const name = String(
              new FormData(event.currentTarget).get("name") ?? ""
            ).trim()
            if (busy) return
            onOpenChange(false)
            onCreate(name === "" ? defaultName : name)
          }}
        >
          <NameBox defaultName={defaultName} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NameBox({ defaultName }: { defaultName: string }) {
  const [text, setText] = useState(defaultName)

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="new-room-name">Room name</Label>
      <Input
        id="new-room-name"
        name="name"
        value={text}
        maxLength={maxRoomName}
        onChange={(event) => setText(event.target.value)}
        autoComplete="off"
        autoFocus
      />
    </div>
  )
}
