import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useChat, useSendChat } from "@/lib/api/chat"
import { formatTime } from "@/lib/format"

/**
 * Chat with the other computer, in the Chat tab. Messages live in memory
 * only and are gone when the session ends. Until someone is connected there
 * is nobody to send to, so the box is off.
 */
export function RoomChat({ connected = true }: { connected?: boolean }) {
  const { data: messages = [], error } = useChat(connected)
  const send = useSendChat()
  const [text, setText] = useState("")
  const [log, setLog] = useState<HTMLDivElement | null>(null)

  // Keep the newest message in view. The scrolling part is the viewport
  // inside the ScrollArea, not the ScrollArea itself.
  useEffect(() => {
    const viewport = log?.querySelector('[data-slot="scroll-area-viewport"]')
    viewport?.scrollTo({ top: viewport.scrollHeight })
  }, [messages.length, log])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea
        ref={setLog}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        className="min-h-0 flex-1"
      >
        <div className="flex flex-col gap-3 p-4">
          {messages.length === 0 ? (
            <p className="text-muted-foreground">
              {connected
                ? "No messages yet. Messages last only while you are connected."
                : "Nobody here yet. Send the link."}
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
          if (!connected || value === "" || send.isPending) return

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
            disabled={!connected}
          />
          <Button
            type="submit"
            disabled={!connected || send.isPending || text.trim() === ""}
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
    </div>
  )
}
