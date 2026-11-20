import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useChat, useSendChat } from "@/lib/api/chat"
import { formatTime } from "@/lib/format"

/**
 * Chat with the other computer, in a sheet from the right. Messages live in
 * memory only and are gone when the session ends.
 */
export function ChatSheet({
  open,
  onOpenChange,
  peerName,
}: {
  /** Whether the sheet is showing. */
  open: boolean
  /** Called when the user opens or closes it. */
  onOpenChange: (open: boolean) => void
  /** Name of the other computer, for the sheet description. */
  peerName: string
}) {
  const { data: messages = [], error } = useChat(true)
  const send = useSendChat()
  const [text, setText] = useState("")
  // State, not a ref: the sheet mounts its content a moment after `open`,
  // and the effect below must run again when the log appears.
  const [log, setLog] = useState<HTMLDivElement | null>(null)

  // Keep the newest message in view. The scrolling part is the viewport
  // inside the ScrollArea, not the ScrollArea itself.
  useEffect(() => {
    const viewport = log?.querySelector('[data-slot="scroll-area-viewport"]')
    viewport?.scrollTo({ top: viewport.scrollHeight })
  }, [messages.length, log])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-[720px]:max-w-none sm:max-w-[360px]">
        <SheetHeader>
          <SheetTitle>Chat</SheetTitle>
          <SheetDescription>
            With {peerName}. Messages last only while you are connected.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea
          ref={setLog}
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
          className="min-h-0 flex-1"
        >
          <div className="flex flex-col gap-3 px-4">
            {messages.length === 0 ? (
              <p className="text-muted-foreground">
                No messages yet. Messages last only while you are connected.
              </p>
            ) : (
              messages.map((message) => (
                <p key={message.id} className="flex flex-col">
                  <span className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {message.fromPeer ? "Them" : "You"}
                    </span>{" "}
                    <time dateTime={message.time}>
                      {formatTime(message.time)}
                    </time>
                  </span>
                  <span className="break-words">{message.text}</span>
                </p>
              ))
            )}
            {error ? (
              <p role="alert" className="text-destructive">
                {error.message}
              </p>
            ) : null}
          </div>
        </ScrollArea>
        <form
          className="flex flex-col gap-2 border-t p-4"
          onSubmit={(event) => {
            event.preventDefault()
            const value = text.trim()
            if (value === "" || send.isPending) return

            // The text stays in the box until the send worked.
            send.mutate(value, { onSuccess: () => setText("") })
          }}
        >
          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label="Message"
              placeholder="Write a message"
              autoComplete="off"
            />
            <Button
              type="submit"
              disabled={send.isPending || text.trim() === ""}
            >
              {send.isPending ? "Sending…" : "Send"}
            </Button>
          </div>
          {send.error ? (
            <p role="alert" className="text-sm text-destructive">
              {send.error.message}
            </p>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  )
}
