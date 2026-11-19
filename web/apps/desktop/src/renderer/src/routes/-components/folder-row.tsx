import { FolderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useChooseFolder } from "@/lib/api/folder"

/** The folder that will be shared, and the button to change it. */
export function FolderRow({
  name,
  canChange,
}: {
  /** Base name of the chosen folder, or null before one is chosen. */
  name: string | null
  /** False while a session is open; the folder can't change then. */
  canChange: boolean
}) {
  const choose = useChooseFolder()

  return (
    <section aria-labelledby="folder-title" className="flex flex-col gap-2">
      <h2 id="folder-title" className="text-sm font-semibold">
        Folder to share
      </h2>
      <div className="flex items-center gap-3">
        <FolderIcon aria-hidden className="size-4 shrink-0" />
        <p className="min-w-0 flex-1 truncate" title={name ?? undefined}>
          {name ?? "Choose a folder to share first."}
        </p>
        <Button
          variant={name ? "outline" : "default"}
          disabled={!canChange || choose.isPending}
          onClick={() => choose.mutate()}
        >
          {choose.isPending ? "Choosing…" : name ? "Change" : "Choose folder"}
        </Button>
      </div>
      {choose.error ? (
        <p role="alert" className="text-sm text-destructive">
          {choose.error.message}
        </p>
      ) : null}
    </section>
  )
}
