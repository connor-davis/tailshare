import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SessionState } from "@/lib/api/types"
import { formatAgo } from "@/lib/format"
import { EmptyState } from "./empty-state"
import { useRecentRooms } from "./recent-rooms"

/** Home cards show only known room history and the current live membership. */
export function HomeBoard({
  session,
  busy,
  onCreate,
  onJoin,
  onReopen,
  onOpenRoom,
}: {
  session: SessionState
  busy: boolean
  onCreate: () => void
  onJoin: (code: string) => void
  /** Hosts a saved room again under its old code. */
  onReopen: (room: { name: string; code: string }) => void
  onOpenRoom: () => void
}) {
  const rooms = useRecentRooms()
  const [query, setQuery] = useState("")
  const [error, setError] = useState(false)
  const idle = session.state === "idle"
  const active = session.state === "hosting" || session.state === "connected"
  const needle = query.trim().toLowerCase()
  const matches = (name: string, code = "") =>
    `${name} ${code}`.toLowerCase().includes(needle)
  const name = session.roomName ?? "Current room"
  const count = session.members?.length ?? 0
  const shown = rooms.filter((room) => matches(room.name, room.code))

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <EmptyState
          enabled={idle}
          busy={busy}
          onCreate={onCreate}
          onJoin={onJoin}
        />
        <section aria-label="Your rooms" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-xl font-semibold">Your rooms</h2>
            <Input
              aria-label="Search home rooms"
              placeholder="Search rooms"
              value={query}
              className="w-full sm:w-60"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("")
              }}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active && matches(name, session.code) ? (
              <Card
                className="gap-0 overflow-hidden py-0"
                aria-label={`Current room: ${name}`}
              >
                <RoomCardHeader
                  name={name}
                  detail={
                    session.role === "host" ? "You are the host" : "You joined"
                  }
                  active
                  status="Open now"
                />
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-hidden className="flex gap-1">
                      {Array.from({ length: 8 }, (_, index) => (
                        <span
                          key={index}
                          className={`size-3.5 rounded-sm border-2 ${index < count ? "border-primary bg-primary" : "border-input"}`}
                        />
                      ))}
                    </span>
                    <span>{count} of 8 seats</span>
                  </div>
                  <Button className="self-start" onClick={onOpenRoom}>
                    Open room
                  </Button>
                </div>
              </Card>
            ) : null}
            {shown.map((room) => (
              <Card
                key={room.code}
                className="gap-0 overflow-hidden py-0"
                aria-label={`Saved room: ${room.name}`}
              >
                <RoomCardHeader
                  name={room.name}
                  detail="Saved on this computer"
                  status="Recent"
                />
                <div className="flex flex-col gap-3 p-4">
                  <p className="text-muted-foreground">
                    Last seen {formatAgo(room.lastSeen)}
                  </p>
                  {!idle ? (
                    <p className="text-xs text-muted-foreground">
                      Leave this room first to rejoin another.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!idle || busy}
                      aria-label={`Rejoin ${room.name}`}
                      onClick={() => onJoin(room.code)}
                    >
                      Rejoin
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!idle || busy}
                      aria-label={`Reopen ${room.name}`}
                      onClick={() => onReopen(room)}
                    >
                      Reopen
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`Forget ${room.name}`}
                      onClick={() => {
                        setError(false)
                        void window.tailshare
                          .removeRecentRoom(room.code)
                          .catch(() => setError(true))
                      }}
                    >
                      Forget
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {shown.length === 0 && !(active && matches(name, session.code)) ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              {needle
                ? "No rooms match. Try another name or code."
                : "No recent rooms. Rooms you leave show up here."}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive">
              Could not forget that room. Try again.
            </p>
          ) : null}
        </section>
      </div>
    </ScrollArea>
  )
}

function RoomCardHeader({
  name,
  detail,
  status,
  active = false,
}: {
  name: string
  detail: string
  status: string
  active?: boolean
}) {
  return (
    <div className="flex items-center gap-3 bg-chrome p-4 text-chrome-foreground">
      <span
        aria-hidden
        className={`grid size-12 shrink-0 place-items-center rounded-md text-xl font-bold ${active ? "bg-primary text-primary-foreground" : "border-2 border-dashed border-input text-chrome-foreground"}`}
      >
        {Array.from(name)[0]?.toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold" title={name}>
          {name}
        </h3>
        <p className="text-xs text-chrome-muted">{detail}</p>
      </div>
      <span className="text-xs font-semibold">{status}</span>
    </div>
  )
}
