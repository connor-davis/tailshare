import { useState } from "react"
import { FolderDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { foldCode } from "@/lib/code-input"
import { useRecentRooms } from "./recent-rooms"

/** Last part of a folder path, for showing it in plain words. */
function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/**
 * A folder just for this room's downloads. It beats "Save to my folder" in
 * Settings. "Use my default" takes it away again.
 */
export function RoomSaveFolder({
  roomCode,
}: {
  /** The room's own code. */
  roomCode: string
}) {
  const code = foldCode(roomCode) ?? ""
  const saved = useRecentRooms().find((room) => room.code === code)?.saveFolder
  const [error, setError] = useState<string | null>(null)

  const set = async (pick: boolean) => {
    setError(null)
    if (!code) return

    try {
      const folder = pick ? await window.tailshare.chooseFolder() : null
      if (pick && !folder) return

      await window.tailshare.setRoomFolder({ code, folder })
    } catch {
      setError("Could not use that folder. Pick another one.")
    }
  }

  return (
    <>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        variant="outline"
        title={saved ?? "Downloads from this room go to your save folder."}
        onClick={() => void set(true)}
      >
        <FolderDownIcon aria-hidden data-icon="inline-start" />
        {saved ? `Saves to ${folderName(saved)}` : "Room save folder"}
      </Button>
      {saved ? (
        <Button variant="ghost" onClick={() => void set(false)}>
          Use my default
        </Button>
      ) : null}
    </>
  )
}
