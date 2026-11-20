import { useEffect, useState } from "react"
import type {
  Settings,
  UpdateChannel,
  UpdateStatus,
} from "../../../../shared/bridge"
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

const messages: Record<UpdateStatus["state"], string> = {
  disabled: "Updates are off in development builds.",
  checking: "Checking for updates…",
  current: "No update available.",
  downloading: "Downloading an update…",
  ready: "An update is ready. Restart when your transfers are finished.",
  error: "Could not check for updates. Tailshare will try again later.",
}

/** Update preferences and a restart action on the connect screen. */
export function UpdatesCard() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let alive = true
    let receivedEvent = false
    const unsubscribe = window.tailshare.onUpdateStatus((next) => {
      receivedEvent = true
      if (alive) setStatus(next)
    })
    void Promise.all([
      window.tailshare.getSettings(),
      window.tailshare.getUpdateStatus(),
    ])
      .then(([saved, current]) => {
        if (!alive) return
        setSettings(saved)
        if (!receivedEvent) setStatus(current)
      })
      .catch(() => {
        if (alive)
          setError(
            "Could not load update settings. Reopen Tailshare to try again."
          )
      })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  async function changeChannel(value: string) {
    if (value !== "latest" && value !== "nightly") return
    setBusy(true)
    setError("")

    try {
      setSettings(
        await window.tailshare.setUpdateChannel(value as UpdateChannel)
      )
    } catch {
      setError("Could not save your update channel. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function restart() {
    setBusy(true)
    setError("")

    try {
      await window.tailshare.restartToUpdate()
    } catch {
      setError("Could not restart to update. Try again.")
      setBusy(false)
    }
  }

  return (
    <Card
      size="sm"
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
          value={settings?.updateChannel ?? "latest"}
          onValueChange={(value) => void changeChannel(value)}
          disabled={!settings || busy}
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
          {settings?.updateChannel === "nightly"
            ? "Nightly follows development builds only. Changes may be unfinished."
            : "Stable follows tested releases. Returning from Nightly waits for a newer stable release."}
        </CardDescription>
        <CardDescription role="status">
          {status ? messages[status.state] : "Loading update settings…"}
          {status?.state === "downloading" && status.percent !== undefined
            ? ` ${Math.round(status.percent)}%`
            : ""}
        </CardDescription>
        {status?.state === "ready" ? (
          <Button disabled={busy} onClick={() => void restart()}>
            {busy ? "Restarting…" : "Restart to update"}
          </Button>
        ) : null}
        {error ? (
          <CardDescription role="alert" className="text-destructive">
            {error}
          </CardDescription>
        ) : null}
      </CardContent>
    </Card>
  )
}
