import { useEffect, useState } from "react"
import type { Settings, UpdateStatus } from "../../../../../shared/bridge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SettingsHandle } from "./use-settings"

const messages: Record<UpdateStatus["state"], string> = {
  disabled: "Updates are off in development builds.",
  checking: "Checking for updates…",
  current: "No update available.",
  downloading: "Downloading an update…",
  ready: "An update is ready. Restart when your transfers are finished.",
  error: "Could not check for updates. Tailshare will try again later.",
}

/** Update preferences and a restart action, on the settings page. */
export function UpdatesCard({
  settings,
  save,
  saving,
}: {
  /** The saved settings. */
  settings: Settings
  /** Saves a patch; resolves to false when it was refused. */
  save: SettingsHandle["save"]
  /** True while a save runs. */
  saving: boolean
}) {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let alive = true
    let receivedEvent = false
    const unsubscribe = window.tailshare.onUpdateStatus((next) => {
      receivedEvent = true
      if (alive) setStatus(next)
    })
    window.tailshare
      .getUpdateStatus()
      .then((current) => {
        if (alive && !receivedEvent) setStatus(current)
      })
      .catch(() => {
        if (alive)
          setError(
            "Could not check for updates. Reopen Tailshare to try again."
          )
      })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  async function restart() {
    setRestarting(true)
    setError("")

    try {
      await window.tailshare.restartToUpdate()
    } catch {
      setError("Could not restart to update. Try again.")
      setRestarting(false)
    }
  }

  return (
    <Card
      role="region"
      className="rounded-lg border ring-0"
      aria-labelledby="updates-title"
    >
      <CardHeader>
        <CardTitle id="updates-title" role="heading" aria-level={2}>
          Updates
        </CardTitle>
        <CardDescription>Updates download in the background.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Label htmlFor="update-channel">Release channel</Label>
        <Select
          value={settings.updateChannel}
          onValueChange={(value) => {
            if (value === "latest" || value === "nightly")
              void save({ updateChannel: value })
          }}
          disabled={saving}
        >
          <SelectTrigger id="update-channel" className="w-full border-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Stable</SelectItem>
            <SelectItem value="nightly">Nightly</SelectItem>
          </SelectContent>
        </Select>
        <CardDescription>
          {settings.updateChannel === "nightly"
            ? "Nightly follows development builds only. Changes may be unfinished."
            : "Stable follows tested releases. Returning from Nightly waits for a newer stable release."}
        </CardDescription>
        <CardDescription role="status">
          {status ? messages[status.state] : "Checking for updates…"}
          {status?.state === "downloading" && status.percent !== undefined
            ? ` ${Math.round(status.percent)}%`
            : ""}
        </CardDescription>
        {status?.state === "ready" ? (
          <Button disabled={restarting} onClick={() => void restart()}>
            {restarting ? "Restarting…" : "Restart to update"}
          </Button>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
