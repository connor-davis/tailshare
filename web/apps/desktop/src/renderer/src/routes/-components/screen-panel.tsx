import { useEffect, useRef, useState } from "react"
import { MaximizeIcon, MonitorIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { CaptureSource } from "../../../../shared/bridge"
import type { ScreenItem, ScreenState } from "@/lib/api/types"
import { playScreen } from "@/lib/media/screen-player"

function Viewer({ item, onStop }: { item: ScreenItem; onStop: () => void }) {
  const { id, codec } = item
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!video.current) return
    return playScreen(video.current, { id, codec }, () => setError(true))
  }, [id, codec]) // Names and viewer counts do not restart playback.

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-2 p-4"
      aria-label={`${item.ownerName}'s screen`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate">
          {item.ownerName}'s screen
        </span>
        {!error && <Badge variant="outline">Live</Badge>}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void video.current?.requestFullscreen().catch(() => setError(true))
          }
        >
          <MaximizeIcon /> Fullscreen
        </Button>
        <Button size="sm" variant="outline" onClick={onStop}>
          Stop watching
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            The screen stream ended or could not play. Stop watching and try
            again.
          </AlertDescription>
        </Alert>
      )}
      <video
        ref={video}
        muted
        autoPlay
        playsInline
        className="min-h-0 w-full flex-1 rounded-md bg-muted object-contain"
        aria-label={`Live screen from ${item.ownerName}`}
      />
    </section>
  )
}

/** Screen controls, explicit source consent, active room shares and view-only playback. */
export function ScreenPanel({
  state,
  loading,
  error,
  busy,
  onShare,
}: {
  state?: ScreenState
  loading: boolean
  error?: string
  busy: boolean
  onShare: (id: string) => Promise<void>
}) {
  const [sources, setSources] = useState<CaptureSource[]>()
  const [picking, setPicking] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [watch, setWatch] = useState<string>()
  const item = state?.others.find((share) => share.id === watch)
  const mine = state?.mine[0]
  const choose = async () => {
    setPicking(true)
    setFailure(undefined)
    try {
      setSources(await window.tailshare.screenSources())
    } catch {
      setFailure("Could not list your screens and windows. Try again.")
    } finally {
      setPicking(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <p className="text-sm text-muted-foreground">
          Screen sharing is experimental. It may lag or stop.
        </p>
        <Button
          size="sm"
          disabled={!!mine || busy || picking}
          onClick={() => void choose()}
        >
          <MonitorIcon />
          {picking ? "Loading choices…" : busy ? "Starting…" : "Share screen"}
        </Button>
      </div>
      {(failure || error) && (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertDescription>{failure || error}</AlertDescription>
        </Alert>
      )}
      {!!state?.unsupported.length && (
        <Alert className="m-4 w-auto">
          <AlertDescription>
            {state.unsupported.join(", ")}: this build cannot watch or share
            screens. Update Tailshare to take part.
          </AlertDescription>
        </Alert>
      )}
      {loading ? (
        <p role="status" className="p-4 text-sm">
          Loading screens…
        </p>
      ) : (
        <>
          {mine && (
            <p className="border-b px-4 py-2 text-sm">
              You are sharing your screen · {mine.viewers}{" "}
              {mine.viewers === 1 ? "viewer" : "viewers"}
            </p>
          )}
          {!!state?.others.length && (
            <ScrollArea className="max-h-40 shrink-0">
              <ul aria-label="Shared screens">
                {state.others.map((share) => (
                  <li
                    key={share.id}
                    className="flex items-center gap-3 border-b px-4 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {share.ownerName} is sharing their screen
                    </span>
                    <Button
                      size="sm"
                      variant={share.id === item?.id ? "outline" : "default"}
                      onClick={() =>
                        setWatch(share.id === item?.id ? undefined : share.id)
                      }
                    >
                      {share.id === item?.id ? "Stop watching" : "Watch"}
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
          {item ? (
            <Viewer
              key={item.id}
              item={item}
              onStop={() => setWatch(undefined)}
            />
          ) : (
            <Empty className="flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MonitorIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {state?.others.length
                    ? "Choose a screen to watch"
                    : "No screens to watch"}
                </EmptyTitle>
                <EmptyDescription>
                  {mine
                    ? "Other members can watch your screen from this tab."
                    : "Share a screen or window with the room, or watch when someone shares."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </>
      )}
      <Dialog
        open={sources !== undefined}
        onOpenChange={(open) => {
          if (!open) setSources(undefined)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Choose what to share <Badge variant="outline">Experimental</Badge>
            </DialogTitle>
            <DialogDescription>
              Everyone in this room can watch the screen or window you choose.
              Sound and remote control stay off.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {sources?.length === 0 && (
              <p role="status" className="p-4 text-sm">
                No screens or windows available. Close this picker and try
                again.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 p-1">
              {sources?.map((source) => (
                <button
                  key={source.id}
                  className="flex flex-col gap-2 rounded-md border bg-card p-2 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setSources(undefined)
                    void onShare(source.id)
                  }}
                >
                  <img
                    src={source.thumbnail}
                    alt=""
                    className="aspect-video w-full rounded object-contain"
                  />
                  <span className="w-full truncate" title={source.name}>
                    {source.name}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
