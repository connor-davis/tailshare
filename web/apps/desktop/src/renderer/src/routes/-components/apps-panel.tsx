import { useT } from "@/i18n/provider"
import { t } from "../../i18n/index"
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
  error instanceof Error
    ? error.message
    : t("appsPanel.somethingWentWrongTryAgain")

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
  const t = useT()

  return (
    <li className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.label}</p>
        <p className="truncate text-muted-foreground">
          {t("appsPanel.ownerPort", {
            owner: mine ? t("common.you") : item.ownerName,
            port: item.port,
          })}
        </p>
      </div>
      {children}
    </li>
  )
}

/** Where an opened app can be reached, with Copy and Open in browser. */
function Address({ localPort, label }: { localPort: number; label: string }) {
  const t = useT()

  const address = `127.0.0.1:${localPort}`
  const [error, setError] = useState<string>()

  return (
    <>
      <code className="rounded bg-muted px-2 py-1">{address}</code>
      <Button
        size="sm"
        variant="outline"
        aria-label={t("appsPanel.copyAddressFor", { label: label })}
        onClick={() => {
          setError(undefined)
          // Promise.resolve also covers a clipboard that throws before returning.
          void Promise.resolve()
            .then(() => navigator.clipboard.writeText(address))
            .then(() => announce(t("appsPanel.addressCopied")))
            .catch(() => setError(t("appsPanel.couldNotCopyTheAddress")))
        }}
      >
        <CopyIcon />
        {t("appsPanel.copy")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        aria-label={t("appsPanel.openInBrowser", { label: label })}
        onClick={() => {
          setError(undefined)
          void window.tailshare
            .openForwardLink(`http://${address}/`)
            .catch(() => setError(t("appsPanel.couldNotOpenTheBrowser")))
        }}
      >
        <ExternalLinkIcon />
        {t("appsPanel.openInBrowser2")}
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
  const t = useT()

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
          {t("appsPanel.shareAWebAppOrAnyLocal")}
        </p>
        <Button size="sm" onClick={() => setDialog(true)} disabled={!connected}>
          <PlusIcon />
          {t("appsPanel.shareAnApp")}
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
            {t("appsPanel.unsupportedPeer", {
              name: data.unsupported.join(", "),
            })}
          </AlertDescription>
        </Alert>
      ) : null}
      {isPending && connected ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          {t("appsPanel.loadingApps")}
        </p>
      ) : mine.length + others.length === 0 ? (
        <Empty className="min-h-0 flex-1 gap-2 p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AppWindowIcon />
            </EmptyMedia>
            <EmptyTitle>{t("appsPanel.noAppsShared")}</EmptyTitle>
            <EmptyDescription>
              {t("appsPanel.shareALocalPortAndTheRoom")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul aria-label={t("appsPanel.sharedApps")}>
            {mine.map((item) => (
              <Row key={item.id} item={item} mine>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={stop.isPending}
                  aria-label={t("appsPanel.stopLabel2", { label: item.label })}
                  onClick={() => stop.mutate(item.id)}
                >
                  {t("appsPanel.stop")}
                </Button>
              </Row>
            ))}
            {others.map((item) => (
              <Row key={item.id} item={item}>
                {item.open && item.localPort ? (
                  <>
                    <Address localPort={item.localPort} label={item.label} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={close.isPending}
                      aria-label={t("appsPanel.closeLabel2", {
                        label: item.label,
                      })}
                      onClick={() => close.mutate(item.id)}
                    >
                      {t("appsPanel.close")}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    disabled={open.isPending}
                    aria-label={t("appsPanel.openLabel2", {
                      label: item.label,
                    })}
                    onClick={() => open.mutate(item.id)}
                  >
                    {t("appsPanel.open")}
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
