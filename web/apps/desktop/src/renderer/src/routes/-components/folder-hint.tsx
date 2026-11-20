import { Button } from "@/components/ui/button"
import { useChooseFolder } from "@/lib/api/folder"

/**
 * Shown until a folder is chosen: says so, with the button right there.
 * Renders nothing once a folder is set.
 */
export function FolderHint({ folderName }: { folderName: string | null }) {
  const choose = useChooseFolder()

  if (folderName) return null

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-muted-foreground">
        No folder chosen yet. Pick the one the other computer will see, or just
        go on and Tailshare asks.
      </p>
      <Button
        variant="outline"
        disabled={choose.isPending}
        onClick={() => choose.mutate()}
      >
        {choose.isPending ? "Choosing…" : "Choose folder"}
      </Button>
      {choose.error ? (
        <p role="alert" className="text-sm text-destructive">
          {choose.error.message}
        </p>
      ) : null}
    </div>
  )
}
