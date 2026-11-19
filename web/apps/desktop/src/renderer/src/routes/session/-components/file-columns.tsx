import type { ColumnDef, SortingState } from "@tanstack/react-table"
import { FileIcon, FolderIcon } from "lucide-react"
import type { FileEntry } from "@/lib/api/types"
import { formatBytes, formatDate } from "@/lib/format"

/** Name, size and modified columns for a folder listing. */
export const fileColumns: ColumnDef<FileEntry>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-2">
        {row.original.isDir ? (
          <FolderIcon aria-hidden className="size-4 shrink-0" />
        ) : (
          <FileIcon aria-hidden className="size-4 shrink-0" />
        )}
        <span className="truncate" title={row.original.name}>
          {row.original.name}
          {row.original.isDir ? (
            <span className="sr-only"> (folder)</span>
          ) : null}
        </span>
      </span>
    ),
  },
  {
    id: "size",
    accessorKey: "size",
    header: "Size",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.isDir ? "—" : formatBytes(row.original.size)}
      </span>
    ),
  },
  {
    id: "modTime",
    accessorKey: "modTime",
    header: "Modified",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatDate(row.original.modTime)}</span>
    ),
  },
]

/**
 * Sort one page of rows. Folders always come first, so a descending sort
 * flips only the order inside each group. ponytail: this sorts the page on
 * screen only; upgrade is a sort parameter on `/api/files/*`.
 */
export function sortEntries(
  entries: FileEntry[],
  sorting: SortingState
): FileEntry[] {
  const [active] = sorting
  if (!active) return entries

  const direction = active.desc ? -1 : 1
  const compare = (a: FileEntry, b: FileEntry): number => {
    if (active.id === "size") return a.size - b.size
    if (active.id === "modTime")
      return Date.parse(a.modTime) - Date.parse(b.modTime)

    return a.name.localeCompare(b.name)
  }

  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1

    return compare(a, b) * direction || a.name.localeCompare(b.name)
  })
}
