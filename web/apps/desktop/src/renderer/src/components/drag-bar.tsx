import type { ReactNode } from "react"
import { cn } from "cn"

/** Width Windows keeps for its minimise, maximise and close buttons. */
const CAPTION_WIDTH = "pr-[138px]"

/**
 * The 40 px strip at the top of a column. It drags the window. A 32 px
 * button inside it gets the same 4 px gap on every side. Windows draws
 * its own caption buttons over the top right of the window, so the column
 * that sits there passes `reserveCaption` and leaves that corner empty.
 */
export function DragBar({
  children,
  reserveCaption = false,
  className,
}: {
  /** What sits in the bar. Wrap anything clickable in {@link NoDrag}. */
  children?: ReactNode
  /** True for the rightmost column, which is under the caption buttons. */
  reserveCaption?: boolean
  /** Extra classes for the bar. */
  className?: string
}) {
  return (
    <header
      className={cn(
        "flex h-10 shrink-0 items-center gap-1 px-1 select-none [-webkit-app-region:drag]",
        reserveCaption && CAPTION_WIDTH,
        className
      )}
    >
      {children}
    </header>
  )
}

/** A group of controls inside a {@link DragBar} that must stay clickable. */
export function NoDrag({
  children,
  className,
}: {
  /** The controls. */
  children: ReactNode
  /** Extra classes for the group. */
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 [-webkit-app-region:no-drag]",
        className
      )}
    >
      {children}
    </div>
  )
}
