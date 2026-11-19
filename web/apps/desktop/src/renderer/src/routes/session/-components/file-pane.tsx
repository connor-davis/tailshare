import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react"
import { Link } from "@tanstack/react-router"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ApiError } from "@/lib/api/client"
import { PAGE_SIZE, useFiles } from "@/lib/api/files"
import { joinPath } from "@/lib/api/transfers"
import type { FileEntry, Side } from "@/lib/api/types"
import { fileColumns, sortEntries } from "./file-columns"
import { PathCrumbs } from "./path-crumbs"
import { RowMenu } from "./row-menu"
import { usePaneDrag, type RowsPayload } from "./use-pane-drag"

/** Props of {@link FilePane}. The page owns path and selection. */
export interface FilePaneProps {
  /** Which computer this pane lists. */
  side: Side
  /** Accessible name, such as "Files on this computer". */
  label: string
  /** Name shown for the shared folder at the top of the trail. */
  rootName: string
  /** Current folder, slash separated; empty for the shared folder. */
  path: string
  /** Called with the folder to show. */
  onPathChange: (path: string) => void
  /** Names of the selected rows. */
  selected: ReadonlySet<string>
  /** Called with the new selection. */
  onSelectedChange: (selected: ReadonlySet<string>) => void
  /** Called with file names to send to the other pane. */
  onSend: (names: string[]) => void
  /** Called when rows from the other pane are dropped here. */
  onDropRows: (payload: RowsPayload) => void
}

function parentOf(path: string): string {
  return path.split("/").slice(0, -1).join("/")
}

/** One side of the session: trail, file table, paging, and every state. */
export function FilePane(props: FilePaneProps) {
  const { side, label, rootName, path, selected, onSelectedChange } = props
  const [offset, setOffset] = useState(0)
  const [sorting, setSorting] = useState<SortingState>([])
  const [focused, setFocused] = useState(0)
  const anchor = useRef(0)
  const body = useRef<HTMLTableSectionElement>(null)
  const files = useFiles(side, path, offset)
  const drag = usePaneDrag(side, props.onDropRows)

  const entries = useMemo(
    () => sortEntries(files.data?.entries ?? [], sorting),
    [files.data, sorting]
  )
  // eslint-disable-next-line react-hooks/incompatible-library -- nothing here is memoized, so the stale-UI risk does not apply
  const table = useReactTable({
    data: entries,
    columns: fileColumns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.name,
  })

  const total = files.data?.total ?? 0
  const chosen = entries.filter((entry) => selected.has(entry.name))
  const chosenFiles = chosen.filter((entry) => !entry.isDir)
  const sendWords = side === "local" ? "Upload →" : "← Download"

  const go = (next: string) => {
    setOffset(0)
    setFocused(0)
    props.onPathChange(next)
  }

  const open = (entry: FileEntry) => {
    if (!entry.isDir) return

    try {
      go(joinPath(path, entry.name))
    } catch {
      // A folder name with a separator can't be a single step; stay put.
    }
  }

  const select = (index: number, event: MouseEvent) => {
    const entry = entries[index]
    if (event.shiftKey) {
      const [from, to] = [
        Math.min(anchor.current, index),
        Math.max(anchor.current, index),
      ]
      onSelectedChange(
        new Set(entries.slice(from, to + 1).map((row) => row.name))
      )
    } else if (event.ctrlKey || event.metaKey) {
      const next = new Set(selected)
      if (!next.delete(entry.name)) next.add(entry.name)
      onSelectedChange(next)
      anchor.current = index
    } else {
      onSelectedChange(new Set([entry.name]))
      anchor.current = index
    }
    setFocused(index)
  }

  const focusRow = (index: number) => {
    const next = Math.max(0, Math.min(entries.length - 1, index))
    setFocused(next)
    body.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-index]"
    )
    if (!row) return
    const index = Number(row.dataset.index)

    if (event.key === "ArrowDown") focusRow(index + 1)
    else if (event.key === "ArrowUp") focusRow(index - 1)
    else if (event.key === " ") {
      const next = new Set(selected)
      if (!next.delete(entries[index].name)) next.add(entries[index].name)
      onSelectedChange(next)
      anchor.current = index
    } else if (event.key === "Enter") open(entries[index])
    else if (event.key === "Backspace" && path !== "") go(parentOf(path))
    else return

    event.preventDefault()
  }

  // The clicked row joins the selection first, as a file manager would.
  const onContext = (event: MouseEvent) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-index]"
    )
    if (!row) return

    const index = Number(row.dataset.index)
    if (!selected.has(entries[index].name)) {
      onSelectedChange(new Set([entries[index].name]))
      anchor.current = index
    }
  }

  const dragStart = (event: React.DragEvent, entry: FileEntry) => {
    const names = selected.has(entry.name)
      ? chosenFiles.map((row) => row.name)
      : entry.isDir
        ? []
        : [entry.name]

    if (names.length === 0) {
      event.preventDefault()

      return
    }
    if (!selected.has(entry.name)) onSelectedChange(new Set([entry.name]))
    drag.dragStart(event, names)
  }

  const error = files.error
  const noFolder = error instanceof ApiError && error.code === "no_folder"

  return (
    <section
      aria-label={label}
      aria-busy={files.isFetching}
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col",
        drag.dropActive && "bg-muted outline-2 -outline-offset-2 outline-ring"
      )}
      {...drag.dropProps}
    >
      <header className="flex items-center gap-2 border-b px-3 py-1.5">
        <PathCrumbs rootName={rootName} path={path} onGo={go} />
        <Button
          variant="outline"
          disabled={chosenFiles.length === 0}
          onClick={() => props.onSend(chosenFiles.map((entry) => entry.name))}
        >
          {sendWords}
        </Button>
      </header>
      {chosen.length > chosenFiles.length ? (
        <p className="border-b px-3 py-1 text-xs text-muted-foreground">
          Folders can't be sent yet. Pick files.
        </p>
      ) : null}

      {noFolder ? (
        <Notice>
          <p>Choose a folder to share first.</p>
          <Link to="/">Back to the connect screen</Link>
        </Notice>
      ) : error ? (
        <Notice>
          <p role="alert">{error.message}</p>
          <Button variant="outline" onClick={() => void files.refetch()}>
            Retry
          </Button>
        </Notice>
      ) : files.isPending ? (
        <Notice>
          <p role="status">Loading files…</p>
        </Notice>
      ) : entries.length === 0 ? (
        <Notice>
          <p>This folder is empty.</p>
        </Notice>
      ) : (
        <RowMenu
          onContext={onContext}
          openLabel={
            chosen.length === 1 && chosen[0].isDir ? "Open" : undefined
          }
          onOpen={() => open(chosen[0])}
          sendLabel={chosenFiles.length > 0 ? sendWords : undefined}
          onSend={() => props.onSend(chosenFiles.map((entry) => entry.name))}
          onSelectAll={() =>
            onSelectedChange(new Set(entries.map((row) => row.name)))
          }
          onRefresh={() => void files.refetch()}
        >
          <Table aria-label={label}>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted()

                    return (
                      <TableHead
                        key={header.id}
                        scope="col"
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                        }
                      >
                        <button
                          type="button"
                          className="min-h-8 font-medium"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {sorted === "asc"
                            ? " ▲"
                            : sorted === "desc"
                              ? " ▼"
                              : ""}
                        </button>
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody ref={body} onKeyDown={onKeyDown}>
              {table.getRowModel().rows.map((row, index) => (
                <TableRow
                  key={row.id}
                  data-index={index}
                  tabIndex={index === focused ? 0 : -1}
                  aria-selected={selected.has(row.original.name)}
                  aria-label={row.original.name}
                  draggable
                  onDragStart={(event) => dragStart(event, row.original)}
                  onClick={(event) => select(index, event)}
                  onDoubleClick={() => open(row.original)}
                  className={cn(
                    "min-h-8 cursor-default",
                    selected.has(row.original.name) &&
                      "bg-primary/20 hover:bg-primary/25"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="max-w-0 first:w-1/2">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </RowMenu>
      )}

      {total > 0 && !error ? (
        <footer className="flex items-center justify-between gap-2 border-t px-3 py-1 text-xs tabular-nums">
          <span>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of{" "}
            {total}
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </span>
        </footer>
      ) : null}
    </section>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
      {children}
    </div>
  )
}
