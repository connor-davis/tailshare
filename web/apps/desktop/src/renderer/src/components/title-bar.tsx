import { Copy, Minus, Square, X } from "lucide-react"
import logo from "../../../../build/logo.svg"
import { Button } from "@/components/ui/button"

/**
 * The window's own title bar, since the frame is off. The bar drags the
 * window; the buttons do not, so they stay clickable and reachable by Tab.
 * `maximized` swaps the middle button between maximise and restore.
 */
export function TitleBar({ maximized }: { maximized: boolean }) {
  const bridge = window.tailshare
  const control =
    "[-webkit-app-region:no-drag] text-muted-foreground hover:text-foreground"

  return (
    <header className="flex h-8 shrink-0 items-center justify-between select-none [-webkit-app-region:drag]">
      <div className="flex items-center gap-2 pl-3 text-xs font-medium">
        <img src={logo} alt="" className="size-4" />
        Tailshare
      </div>

      <div className="flex h-full items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Minimize"
          className={control}
          onClick={() => void bridge.minimizeWindow()}
        >
          <Minus aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={maximized ? "Restore" : "Maximize"}
          className={control}
          onClick={() => void bridge.toggleMaximizeWindow()}
        >
          {maximized ? <Copy aria-hidden /> : <Square aria-hidden />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          className={`${control} hover:bg-destructive hover:text-background`}
          onClick={() => void bridge.closeWindow()}
        >
          <X aria-hidden />
        </Button>
      </div>
    </header>
  )
}
