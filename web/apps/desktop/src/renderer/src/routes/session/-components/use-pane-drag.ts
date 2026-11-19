import { useState, type DragEvent } from "react"
import type { Side } from "@/lib/api/types"

/** The drag data type for file rows moving between the panes. */
export const ROWS_MIME = "application/x-tailshare-rows"

/** What a drag carries: where the rows came from and their names. */
export interface RowsPayload {
  /** The pane the rows were dragged out of. */
  side: Side
  /** File names inside that pane's current folder. */
  names: string[]
}

function parsePayload(raw: string): RowsPayload | null {
  try {
    const value = JSON.parse(raw) as Partial<RowsPayload>
    const side = value.side === "local" || value.side === "peer"
    const names =
      Array.isArray(value.names) &&
      value.names.every((name) => typeof name === "string")

    return side && names ? (value as RowsPayload) : null
  } catch {
    return null
  }
}

/**
 * Native drag and drop for one pane: rows can be dragged out, and rows from
 * the other pane can be dropped in. Dropping on the same pane does nothing.
 */
export function usePaneDrag(
  side: Side,
  onDropRows: (payload: RowsPayload) => void
) {
  const [dropActive, setDropActive] = useState(false)

  // The source side rides along as a second type, because a drag in flight
  // lets us read its types but not its data.
  const fromHere = `${ROWS_MIME}.${side}`

  return {
    dropActive,
    dragStart: (event: DragEvent, names: string[]) => {
      const payload: RowsPayload = { side, names }
      event.dataTransfer.setData(ROWS_MIME, JSON.stringify(payload))
      event.dataTransfer.setData(`${ROWS_MIME}.${side}`, "")
      event.dataTransfer.effectAllowed = "copy"
    },
    dropProps: {
      onDragOver: (event: DragEvent) => {
        const types = event.dataTransfer.types
        if (!types.includes(ROWS_MIME) || types.includes(fromHere)) return

        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
        setDropActive(true)
      },
      onDragLeave: (event: DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropActive(false)
        }
      },
      onDrop: (event: DragEvent) => {
        setDropActive(false)
        const payload = parsePayload(event.dataTransfer.getData(ROWS_MIME))
        if (!payload || payload.side === side) return

        event.preventDefault()
        onDropRows(payload)
      },
    },
  }
}
