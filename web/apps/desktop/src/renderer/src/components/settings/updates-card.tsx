import { useState } from "react"
import type { Settings, UpdateStatus } from "../../../../shared/bridge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { UpdateRelease } from "../update-release"
import { useUpdateActions, useUpdateStatus } from "../use-update-status"
import { SettingList, SettingRow } from "./setting-row"
import { Section } from "./settings-fields"
import type { SettingsHandle } from "./use-settings"

const messages: Record<UpdateStatus["state"], string> = {
  disabled: "Updates are off in development builds.",
  checking: "Checking for updates…",
  current: "No update available.",
  available: "An update is available.",
  downloading: "Downloading an update…",
  ready: "An update is ready. Restart when your transfers are finished.",
  error: "Could not update Tailshare. Check for updates to try again.",
}

/** Update preferences, the release notes and the download and restart actions, in the settings dialog. */
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
  const { status, error: statusError } = useUpdateStatus()
  const actions = useUpdateActions()
  const [checkError, setCheckError] = useState("")
  const error = actions.error || checkError

  async function checkNow() {
    setCheckError("")

    try {
      await window.tailshare.checkForUpdates()
    } catch {
      setCheckError("Could not check for updates. Try again.")
    }
  }

  return (
    <Section
      id="updates-title"
      title="Updates"
      description="Review what’s new, then choose when to download."
    >
      <SettingList>
        <SettingRow
          label="Release channel"
          htmlFor="update-channel"
          description={
            settings.updateChannel === "nightly"
              ? "Nightly follows development builds only. Changes may be unfinished."
              : "Stable follows tested releases. Returning from Nightly waits for a newer stable release."
          }
        >
          <Select
            value={settings.updateChannel}
            onValueChange={(value) => {
              if (value === "latest" || value === "nightly")
                void save({ updateChannel: value })
            }}
            disabled={saving}
          >
            <SelectTrigger id="update-channel" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Stable</SelectItem>
              <SelectItem value="nightly">Nightly</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          label="Status"
          description={
            <span role="status">
              {status ? messages[status.state] : "Checking for updates…"}
              {status?.state === "downloading" && status.percent !== undefined
                ? ` ${Math.round(status.percent)}%`
                : ""}
            </span>
          }
        >
          {status?.state === "ready" ? (
            <Button
              disabled={actions.pending === "restart"}
              onClick={() => void actions.restart()}
            >
              {actions.pending === "restart"
                ? "Restarting…"
                : "Restart to update"}
            </Button>
          ) : status?.state === "available" ? (
            <Button
              disabled={actions.pending === "download"}
              onClick={() => void actions.download()}
            >
              {actions.pending === "download"
                ? "Starting download…"
                : "Download"}
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={
                !status ||
                status.state === "disabled" ||
                status.state === "checking" ||
                status.state === "downloading"
              }
              onClick={() => void checkNow()}
            >
              {status?.state === "checking" ? "Checking…" : "Check for updates"}
            </Button>
          )}
        </SettingRow>
      </SettingList>
      {status?.state === "available" ? (
        <div className="grid min-w-0 gap-3">
          <h3 className="text-sm font-medium">
            What's new in {status.version}
          </h3>
          <UpdateRelease key={status.version} status={status} />
        </div>
      ) : null}
      {status?.state === "downloading" ? (
        <Progress
          aria-label="Update download"
          aria-valuenow={status.percent ?? 0}
          value={status.percent ?? 0}
        />
      ) : null}
      {error || statusError ? (
        <Alert variant="destructive">
          <AlertDescription>{error || statusError}</AlertDescription>
        </Alert>
      ) : null}
    </Section>
  )
}
