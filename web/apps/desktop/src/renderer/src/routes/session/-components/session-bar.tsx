import { useEffect } from "react"
import { SettingsIcon } from "lucide-react"
import { useOpenSettings } from "@/components/settings/settings-dialog"
import { announce } from "@/components/status-region"
import { Button } from "@/components/ui/button"
import type { PeerInfo } from "@/lib/api/types"
import { useLiveStatus } from "@/lib/live/use-live"

/** The 56px bar on top: who we are connected to, chat toggle, and Leave. */
export function SessionBar({
  peer,
  chatOpen,
  onToggleChat,
  onLeave,
  leaving,
}: {
  /** The other computer. */
  peer: PeerInfo
  /** Whether the chat sheet is showing. */
  chatOpen: boolean
  /** Opens or closes the chat sheet. */
  onToggleChat: () => void
  /** Leaves the session. */
  onLeave: () => void
  /** True while the leave call is running. */
  leaving: boolean
}) {
  const live = useLiveStatus()
  const openSettings = useOpenSettings()
  const reconnecting = live === "reconnecting"

  useEffect(() => {
    if (live === "reconnecting") announce("Reconnecting…")
    else if (live === "open") announce("Connected.")
  }, [live])

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-4">
      <h1 className="text-xl font-semibold">Tailshare</h1>
      <p className="min-w-0 flex-1 truncate">
        <span className="font-medium" title={peer.displayName}>
          {peer.displayName}
        </span>
        <span className="text-muted-foreground">
          {" "}
          · shares {peer.sharedFolderName}
        </span>
      </p>
      <p className="text-sm font-medium">
        {reconnecting ? "Reconnecting…" : "Connected"}
      </p>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Settings"
        onClick={openSettings}
      >
        <SettingsIcon aria-hidden />
      </Button>
      <Button variant="outline" aria-expanded={chatOpen} onClick={onToggleChat}>
        Chat
      </Button>
      <Button variant="outline" disabled={leaving} onClick={onLeave}>
        {leaving ? "Leaving…" : "Leave"}
      </Button>
    </header>
  )
}
