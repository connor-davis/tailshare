import { useState, type ReactNode } from "react"
import {
  AppWindowIcon,
  CopyIcon,
  ExternalLinkIcon,
  PlusIcon,
} from "lucide-react"
import { announce } from "@/components/status-region"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  useCloseApp,
  useForwards,
  useOpenApp,
  useShareApp,
  useStopApp,
} from "@/lib/api/forwards"
import type { ForwardItem } from "@/lib/api/types"
import { ShareAppDialog } from "./share-app-dialog"

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Try again."

/** One line: name, who shares it and its buttons. */
function Row({
  item,
  mine,
  children,
}: {
  item: ForwardItem
  mine?: boolean
  children: ReactNode
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.label}</p>
        <p className="truncate text-muted-foreground">
          {mine ? "You" : item.ownerName} · port {item.port}
        </p>
      </div>
      {children}
    </li>
  )
}

/** Where an opened app can be reached, with Copy and Open in browser. */
function Address({ localPort }: { localPort: number }) {
  const address = `127.0.0.1:${localPort}`
  const [error, setError] = useState<string>()

  return (
    <>
      <code className="rounded bg-muted px-2 py-1">{address}</code>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setError(undefined)
          // Promise.resolve also covers a clipboard that throws before returning.
          void Promise.resolve()
            .then(() => navigator.clipboard.writeText(address))
            .then(() => announce("Address copied."))
            .catch(() => setError("Could not copy the address."))
        }}
      >
        <CopyIcon /> Copy
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setError(undefined)
          void window.tailshare
            .openForwardLink(`http://${address}/`)
            .catch(() => setError("Could not open the browser."))
        }}
      >
        <ExternalLinkIcon /> Open in browser
      </Button>
      {error ? (
        <p role="alert" className="w-full text-destructive">
          {error}
        </p>
      ) : null}
    </>
  )
}

/**
 * The room's shared apps: mine with Stop, everyone else's with Open and Close.
 * The list comes live from the sidecar; nothing here polls.
 */
export function AppsPanel({ connected = true }: { connected?: boolean }) {
  const { data, error, isPending } = useForwards(connected)
  const share = useShareApp()
  const stop = useStopApp()
  const open = useOpenApp()
  const close = useCloseApp()
  const [dialog, setDialog] = useState(false)

  const failure = stop.error ?? open.error ?? close.error ?? error
  const mine = data?.mine ?? []
  const others = data?.others ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <p className="text-sm text-muted-foreground">
          Share a web app or any local port with the room.
        </p>
        <Button size="sm" onClick={() => setDialog(true)} disabled={!connected}>
          <PlusIcon /> Share an app
        </Button>
      </div>
      {failure ? (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertDescription>{message(failure)}</AlertDescription>
        </Alert>
      ) : null}
      {data?.unsupported?.length ? (
        <Alert className="m-4 w-auto">
          <AlertDescription>
            {data.unsupported.join(", ")}: this build of Tailshare cannot share
            apps. Update it to see their apps.
          </AlertDescription>
        </Alert>
      ) : null}
      {isPending && connected ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          Loading apps…
        </p>
      ) : mine.length + others.length === 0 ? (
        <Empty className="min-h-0 flex-1 gap-2 p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AppWindowIcon />
            </EmptyMedia>
            <EmptyTitle>No apps shared</EmptyTitle>
            <EmptyDescription>
              Share a local port and the room can open it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul aria-label="Shared apps">
            {mine.map((item) => (
              <Row key={item.id} item={item} mine>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={stop.isPending}
                  onClick={() => stop.mutate(item.id)}
                >
                  Stop
                </Button>
              </Row>
            ))}
            {others.map((item) => (
              <Row key={item.id} item={item}>
                {item.open && item.localPort ? (
                  <>
                    <Address localPort={item.localPort} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={close.isPending}
                      onClick={() => close.mutate(item.id)}
                    >
                      Close
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    disabled={open.isPending}
                    onClick={() => open.mutate(item.id)}
                  >
                    Open
                  </Button>
                )}
              </Row>
            ))}
          </ul>
        </ScrollArea>
      )}
      <ShareAppDialog
        open={dialog}
        onOpenChange={setDialog}
        busy={share.isPending}
        error={share.error ? message(share.error) : undefined}
        onShare={(port, label) =>
          share.mutate({ port, label }, { onSuccess: () => setDialog(false) })
        }
      />
    </div>
  )
}
