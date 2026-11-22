import { useT } from "@/i18n/provider"
import { useEffect, useRef, useState } from "react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useFolderPage, type FolderEntry } from "@/lib/api/files"
import { useStartTransfer } from "@/lib/api/transfers"
import { useDownloadsOk } from "@/components/use-downloads-status"
import { formatBytes } from "@/lib/format"
import type { BrowseFolder } from "./folder-browse-context"

function Directory({
  folder,
  depth = 0,
}: {
  folder: BrowseFolder
  depth?: number
}) {
  const t = useT()

  const [open, setOpen] = useState(depth === 0)

  const [filter, setFilter] = useState("")

  const page = useFolderPage(folder.path, folder.scope, open)

  const start = useStartTransfer()

  const downloadsOk = useDownloadsOk()

  const entries = page.data?.pages.flatMap((part) => part.entries) ?? []
  // ponytail: this filters loaded names only; recursive search needs an optional list query.
  const shown = entries.filter((entry) =>
    entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())
  )

  const download = (entry: FolderEntry) =>
    start.mutate({
      direction: "download",
      source: `${folder.path}/${entry.name}`,
      destination: entry.name,
      ...(entry.isDir ? { folder: true } : {}),
    })

  return (
    <div className="min-w-0">
      {depth > 0 ? (
        <div className="flex min-w-0 items-center gap-2 py-1">
          <Button
            variant="ghost"
            className="min-w-0 flex-1 justify-start"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? (
              <ChevronDownIcon aria-hidden />
            ) : (
              <ChevronRightIcon aria-hidden className="rtl:-scale-x-100" />
            )}
            <FolderIcon aria-hidden className="text-primary" />
            <span className="truncate" title={folder.name} dir="auto">
              {folder.name}
            </span>
          </Button>
          {folder.scope === "peer" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!downloadsOk || start.isPending}
              aria-label={t("roomFolderBrowser.downloadLabel", {
                name: folder.name,
              })}
              onClick={() =>
                start.mutate({
                  direction: "download",
                  source: folder.path,
                  destination: folder.name,
                  folder: true,
                })
              }
            >
              {t("roomFolderBrowser.download")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <div className={depth ? "ms-3 min-w-0 border-s ps-3" : "min-w-0"}>
          <Input
            aria-label={t("roomFolderBrowser.filter", { name: folder.name })}
            placeholder={t("roomFolderBrowser.filterLoadedNames")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <p className="py-2 text-xs text-muted-foreground">
            {t("folderBrowser.loadedCount", {
              count: entries.length,
              total: page.data?.pages[0]?.total ?? 0,
            })}
          </p>
          {page.isPending ? (
            <p role="status">{t("roomFolderBrowser.loadingFolder")}</p>
          ) : null}
          {page.error ? (
            <div role="alert">
              <p>{page.error.message}</p>
              <Button variant="outline" onClick={() => void page.refetch()}>
                {t("roomFolderBrowser.tryAgain")}
              </Button>
            </div>
          ) : null}
          {!page.isPending && !page.error && !shown.length ? (
            <p className="py-3 text-muted-foreground">
              {entries.length
                ? t("roomFolderBrowser.noLoadedNamesMatch")
                : t("roomFolderBrowser.thisFolderIsEmpty")}
            </p>
          ) : null}
          {shown.map((entry) =>
            entry.isDir && depth < 32 ? (
              <Directory
                key={entry.name}
                depth={depth + 1}
                folder={{
                  path: `${folder.path}/${entry.name}`,
                  name: entry.name,
                  scope: folder.scope,
                }}
              />
            ) : (
              <div
                key={entry.name}
                className="flex min-w-0 items-center gap-2 py-2"
              >
                <FileIcon
                  aria-hidden
                  className="size-4 shrink-0 text-primary"
                />
                <span
                  className="min-w-0 flex-1 truncate"
                  title={entry.name}
                  dir="auto"
                >
                  {entry.name}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatBytes(entry.size)}
                </span>
                {folder.scope === "peer" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!downloadsOk || start.isPending}
                    aria-label={t("roomFolderBrowser.downloadLabel", {
                      name: entry.name,
                    })}
                    onClick={() => download(entry)}
                  >
                    {t("roomFolderBrowser.download")}
                  </Button>
                ) : null}
              </div>
            )
          )}
          {page.hasNextPage ? (
            <Button
              variant="outline"
              disabled={page.isFetchingNextPage}
              aria-label={t("roomFolderBrowser.loadMoreIn", {
                name: folder.name,
              })}
              onClick={() => void page.fetchNextPage()}
            >
              {page.isFetchingNextPage
                ? t("roomFolderBrowser.loading")
                : t("roomFolderBrowser.loadMore")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {start.error ? (
        <p role="alert" className="text-sm text-destructive">
          {start.error.message}
        </p>
      ) : null}
    </div>
  )
}

/** A lazy folder tree inside the existing Files tile, with filtering per open folder. */
export function RoomFolderBrowser({
  folder,
  onClose,
}: {
  folder: BrowseFolder
  onClose: () => void
}) {
  const t = useT()

  // Browse came from another tile that is now hidden, so focus follows to the
  // folder name. Fields the person is typing in are left alone.
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const here = document.activeElement
    if (here?.closest("input, textarea, select, [contenteditable]")) return

    heading.current?.focus()
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b p-3">
        <Button variant="outline" onClick={onClose}>
          {t("roomFolderBrowser.sharedFiles")}
        </Button>
        <h3
          ref={heading}
          tabIndex={-1}
          className="min-w-0 truncate font-semibold outline-none"
          title={folder.name}
          dir="auto"
        >
          {folder.name}
        </h3>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          <Directory key={`${folder.scope}:${folder.path}`} folder={folder} />
        </div>
      </ScrollArea>
    </div>
  )
}
