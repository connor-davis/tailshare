import type { MouseEvent, ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

/** Right-click menu for a file pane. Every item has a button elsewhere too. */
export function RowMenu({
  children,
  onContext,
  openLabel,
  onOpen,
  sendLabel,
  onSend,
  onSelectAll,
  onRefresh,
}: {
  /** The scrolling area the menu belongs to. */
  children: ReactNode
  /** Runs first, so the clicked row can join the selection. */
  onContext: (event: MouseEvent) => void
  /** Set when exactly one folder is selected. */
  openLabel?: string
  /** Opens that folder. */
  onOpen: () => void
  /** Set when the selection holds files, such as "Upload →". */
  sendLabel?: string
  /** Sends the selected files to the other pane. */
  onSend: () => void
  /** Selects every row on the page. */
  onSelectAll: () => void
  /** Loads the page again. */
  onRefresh: () => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <ScrollArea onContextMenu={onContext} className="min-h-0 flex-1">
          {children}
        </ScrollArea>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {openLabel ? (
          <ContextMenuItem onSelect={onOpen}>{openLabel}</ContextMenuItem>
        ) : null}
        {sendLabel ? (
          <ContextMenuItem onSelect={onSend}>{sendLabel}</ContextMenuItem>
        ) : null}
        {openLabel || sendLabel ? <ContextMenuSeparator /> : null}
        <ContextMenuItem onSelect={onSelectAll}>Select all</ContextMenuItem>
        <ContextMenuItem onSelect={onRefresh}>Refresh</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
