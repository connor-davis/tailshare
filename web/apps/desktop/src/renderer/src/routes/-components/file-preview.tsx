import type { FilePreview as Preview } from "../../../../shared/bridge"

/** The only picture types a preview may show. SVG is left out: it can carry script. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"]

/**
 * What a file card shows under the name: a small picture, the first lines of a
 * text file, or nothing when there is nothing safe to show.
 */
export function FilePreview({
  preview,
  name,
}: {
  /** The reply from the sidecar. */
  preview: Preview | undefined
  /** The file name, for the picture's label. */
  name: string
}) {
  if (!preview || preview.kind === "none") return null

  if (preview.kind === "image") {
    if (!IMAGE_TYPES.includes(preview.mime)) return null

    return (
      <img
        alt={`Preview of ${name}`}
        src={`data:${preview.mime};base64,${preview.data}`}
        className="size-16 rounded-md border border-border object-cover"
      />
    )
  }

  return (
    <p
      className="line-clamp-2 rounded-md bg-muted px-2 py-1 text-xs break-words text-muted-foreground"
      aria-label={`Start of ${name}`}
    >
      {preview.text}
      {preview.cut ? "…" : ""}
    </p>
  )
}
