import { useState } from "react"
import { announce } from "@/components/status-region"
import { ApiError } from "@/lib/api/client"
import { useSendChat } from "@/lib/api/chat"
import type { AddFilesResult } from "../../../../shared/bridge"

/** One file that could not be added, with the reason in plain words. */
export type SkippedFile = AddFilesResult["skipped"][number]

/**
 * Adds files to the room folder and posts one chat message per file, so the
 * other person gets a card each. The Add button and a drop both go through
 * `share`; the screen only ever hands over files, never a path.
 */
export function useShareFiles() {
  const send = useSendChat()
  const [skipped, setSkipped] = useState<SkippedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Runs one pick (dialog or drop), then posts a message for each file. */
  async function share(pick: () => Promise<AddFilesResult | null>) {
    setBusy(true)
    setError(null)

    try {
      const result = await pick()
      // Cancelling the dialog is not an error and changes nothing.
      if (!result) return

      setSkipped(result.skipped)
      for (const added of result.added) {
        await send.mutateAsync({ text: "", attachment: { path: added.name } })
      }
      if (result.added.length > 0) {
        announce(`Shared ${result.added.length} file(s).`)
      }
    } catch (reason) {
      // Only the sidecar's own sentences go on screen; anything else is vague.
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Could not add those files. Try again."
      )
    } finally {
      setBusy(false)
    }
  }

  return {
    busy,
    error,
    skipped,
    /** Opens the file dialog and shares what was picked. */
    addFiles: () => share(() => window.tailshare.addFiles()),
    /**
     * Reads the clipboard (main does it, on this click only). A picture is shared
     * like an added file; text is sent as a message.
     */
    paste: () =>
      share(async () => {
        const pasted = await window.tailshare.pasteFromClipboard()
        if (pasted.kind === "text") {
          await send.mutateAsync({ text: pasted.text.trim() })
          return null
        }
        if (pasted.kind === "none") {
          setError("Nothing to paste. Copy some text or a picture first.")
          return null
        }

        return pasted.result
      }),
    /** Shares files dropped on the chat. */
    addDropped: (files: File[]) =>
      share(() => window.tailshare.addDroppedFiles(files)),
    /** Hides the skipped list and any error. */
    dismiss: () => {
      setSkipped([])
      setError(null)
    },
  }
}
