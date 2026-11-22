import { lstatSync } from "node:fs"
import { join } from "node:path"
import { Effect } from "effect"
import type { FilePreview } from "../shared/bridge"
import {
  CHANNELS,
  FilePreviewSchema,
  TRANSFER_ID,
  TransferIdSchema,
} from "../shared/ipc-schema"
import { check, type IpcHost } from "./ipc"

/** Most finished downloads main remembers. The oldest one is forgotten first. */
const MAX_REMEMBERED = 200

/** A file name from the sidecar: one part, no drive or stream marker. */
const SAFE_NAME = /^[^\\/:]+$/

/** One remembered download: where it went and the name it was saved under. */
export interface SavedDownload {
  readonly folder: string
  readonly name: string
}

/**
 * Remembers, in memory only, which folder each download this window started
 * went to. The page knows only a transfer id, so dragging a file out and
 * previewing it both ask main, which builds the path itself.
 */
export function createSavedDownloads() {
  // ponytail: a cap, not a real limit. After a restart or 200 more downloads a
  // row can no longer be dragged or previewed; asking the sidecar for the path
  // would lift that, but needs a Go change.
  const known = new Map<string, SavedDownload>()

  return {
    /** Notes a started download from the sidecar's reply. Odd replies are ignored. */
    remember(item: unknown, folder: string) {
      const { id, destination } = (item ?? {}) as Record<string, unknown>
      if (
        typeof id !== "string" ||
        !TRANSFER_ID.test(id) ||
        typeof destination !== "string" ||
        !SAFE_NAME.test(destination) ||
        destination === "." ||
        destination === ".."
      )
        return

      known.delete(id)
      known.set(id, { folder, name: destination })
      if (known.size > MAX_REMEMBERED)
        known.delete(known.keys().next().value as string)
    },

    /**
     * The file for a remembered id, only while it is still a regular file
     * (not a link) inside a real folder. Otherwise `null`.
     */
    locate(id: string): (SavedDownload & { file: string }) | null {
      const entry = known.get(id)
      if (!entry) return null

      try {
        const folder = lstatSync(entry.folder)
        if (!folder.isDirectory() || folder.isSymbolicLink()) return null

        // lstat describes a link itself, so a link is never a regular file here.
        const file = join(entry.folder, entry.name)
        return lstatSync(file).isFile() ? { ...entry, file } : null
      } catch {
        return null
      }
    },
  }
}

/** The finished-downloads memory, as the IPC handlers use it. */
export type SavedDownloads = ReturnType<typeof createSavedDownloads>

/** What the handlers need from Electron and the sidecar. */
export interface SavedHost {
  /** Starts the OS drag of one file out of the window. */
  startDrag(file: string): void
  /** Shows one file in the file manager, selected. */
  reveal(file: string): void
  /** Asks the sidecar for a preview of a file in a folder. */
  preview(entry: SavedDownload): Promise<unknown>
}

/**
 * Registers drag-out, reveal and preview for finished downloads. The page sends a
 * transfer id and nothing else; ids main does not know are quietly ignored.
 */
export function registerSavedIpc(
  host: IpcHost,
  saved: SavedDownloads,
  deps: SavedHost
) {
  const idFrom = async (senderOk: boolean, args: unknown[]) => {
    if (!senderOk || args.length !== 1)
      throw new Error("Tailshare could not read that request.")

    try {
      return await Effect.runPromise(check(TransferIdSchema, args[0]))
    } catch {
      throw new Error("Tailshare could not read that request.")
    }
  }

  host.handle(
    CHANNELS.canDragFile,
    async (senderOk, args) =>
      saved.locate(await idFrom(senderOk, args)) !== null
  )

  host.handle(CHANNELS.startFileDrag, async (senderOk, args) => {
    const found = saved.locate(await idFrom(senderOk, args))
    if (found) deps.startDrag(found.file)
  })

  host.handle(CHANNELS.revealDownload, async (senderOk, args) => {
    const found = saved.locate(await idFrom(senderOk, args))
    if (found) deps.reveal(found.file)
  })

  host.handle(CHANNELS.previewDownload, async (senderOk, args) => {
    const none: FilePreview = { kind: "none" }
    const found = saved.locate(await idFrom(senderOk, args))
    if (!found) return none

    // A preview is a nicety: any failure just means there is none.
    try {
      return await Effect.runPromise(
        check(FilePreviewSchema, await deps.preview(found))
      )
    } catch {
      return none
    }
  })
}
