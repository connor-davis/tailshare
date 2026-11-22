import { useState, type KeyboardEvent } from "react"
import { ArrowUpIcon, ClipboardPasteIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useSendChat } from "@/lib/api/chat"

/**
 * The box pinned under the chat, like T3 Code's: a big rounded frame with a
 * text area that grows to about eight lines, a "+" to add files and a send
 * button. Paste sends what was copied. Enter sends, Shift+Enter starts a new line. It is off until
 * someone else is in the room, because there is nobody to send to.
 */
export function ChatComposer({
  connected,
  busy,
  onAddFiles,
  onAddFolder,
  onPaste,
}: {
  /** True once another computer is in the room. */
  connected: boolean
  /** True while files are being added, so the button waits. */
  busy: boolean
  /** Opens the file dialog. */
  onAddFiles: () => void
  /** Opens the folder dialog. */
  onAddFolder?: () => void
  /** Reads the clipboard: text is sent, a picture is shared as a file. */
  onPaste: () => void
}) {
  const send = useSendChat()
  const [text, setText] = useState("")
  const value = text.trim()

  const submit = () => {
    if (!connected || value === "" || send.isPending) return

    // The text stays in the box until the send worked. Clear it only if it is
    // still what was sent: anything typed meanwhile is a new draft.
    const sent = text
    send.mutate(
      { text: value },
      { onSuccess: () => setText((now) => (now === sent ? "" : now)) }
    )
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an input method is composing picks a character, not "send".
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return

    event.preventDefault()
    submit()
  }

  return (
    <form
      className="shrink-0 px-4 pb-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="flex w-full flex-col gap-1.5">
        {/* T3 shape: the text on top, a tool row under it. */}
        <div className="flex flex-col rounded-2xl border border-input bg-field focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Message"
            placeholder={
              connected ? "Write a message" : "Waiting for someone to join…"
            }
            rows={2}
            className="max-h-48 min-h-14 border-0 bg-transparent px-4 pt-3 pb-1 focus-visible:ring-0 disabled:opacity-100"
            disabled={!connected}
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Add files"
              disabled={!connected || busy}
              onClick={onAddFiles}
            >
              <PlusIcon aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!connected || busy}
              onClick={onAddFolder}
            >
              Folder
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Paste"
              title="Send what you copied"
              disabled={!connected || busy}
              onClick={onPaste}
            >
              <ClipboardPasteIcon aria-hidden />
            </Button>
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {connected
                ? "Enter to send, Shift+Enter for a new line"
                : "Waiting for someone to join"}
            </p>
            <Button
              type="submit"
              size="icon"
              aria-label="Send"
              className="rounded-full"
              disabled={!connected || send.isPending || value === ""}
            >
              <ArrowUpIcon aria-hidden />
            </Button>
          </div>
        </div>
        {send.error ? (
          <p role="alert" className="px-2 text-sm text-destructive">
            {send.error.message}
          </p>
        ) : null}
      </div>
    </form>
  )
}
