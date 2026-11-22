import { useT } from "@/i18n/provider"
import { t } from "../../i18n/index"
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

const messages = (): Record<UpdateStatus["state"], string> => ({
  disabled: t("updatesCard.updatesAreOffInDevelopmentBuilds"),
  checking: t("updatesCard.checkingForUpdates"),
  current: t("updatesCard.noUpdateAvailable"),
  available: t("updatesCard.anUpdateIsAvailable"),
  downloading: t("updatesCard.downloadingAnUpdate"),
  ready: t("updatesCard.anUpdateIsReadyRestartWhenYour"),
  error: t("updatesCard.couldNotUpdateTailshareCheckForUpdates"),
})

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
  const t = useT()

  const { status, error: statusError } = useUpdateStatus()
  const actions = useUpdateActions()
  const [checkError, setCheckError] = useState("")
  const error = actions.error || checkError

  async function checkNow() {
    setCheckError("")

    try {
      await window.tailshare.checkForUpdates()
    } catch {
      setCheckError(t("updatesCard.couldNotCheckForUpdatesTryAgain"))
    }
  }

  return (
    <Section
      id="updates-title"
      title={t("updatesCard.updates")}
      description={t("updatesCard.reviewWhatSNewThenChooseWhen")}
    >
      <SettingList>
        <SettingRow
          label={t("updatesCard.releaseChannel")}
          htmlFor="update-channel"
          description={
            settings.updateChannel === "nightly"
              ? t("updatesCard.nightlyFollowsDevelopmentBuildsOnlyChangesMay")
              : t("updatesCard.stableFollowsTestedReleasesReturningFromNightly")
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
              <SelectItem value="latest">{t("updatesCard.stable")}</SelectItem>
              <SelectItem value="nightly">
                {t("updatesCard.nightly")}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          label={t("updatesCard.status")}
          description={
            <span role="status">
              {status
                ? status.reason === "portable"
                  ? t("updatesCard.portableUpdates")
                  : status.reason === "unsigned"
                    ? t("updatesCard.unsignedUpdates")
                    : messages()[status.state]
                : t("updatesCard.checkingForUpdates")}
              {status?.state === "downloading" && status.percent !== undefined
                ? ` ${Math.round(status.percent)}%`
                : ""}
            </span>
          }
        >
          {status?.reason ? (
            <Button
              variant="outline"
              onClick={() =>
                void window.tailshare
                  .openReleaseLink(
                    "https://github.com/connor-davis/tailshare/releases"
                  )
                  .catch(() =>
                    setCheckError(
                      t("updatesCard.couldNotCheckForUpdatesTryAgain")
                    )
                  )
              }
            >
              {t("updatesCard.releasesPage")}
            </Button>
          ) : status?.state === "ready" ? (
            <Button
              disabled={actions.pending === "restart"}
              onClick={() => void actions.restart()}
            >
              {actions.pending === "restart"
                ? t("updatesCard.restarting")
                : t("updatesCard.restartToUpdate")}
            </Button>
          ) : status?.state === "available" ? (
            <Button
              disabled={actions.pending === "download"}
              onClick={() => void actions.download()}
            >
              {actions.pending === "download"
                ? t("updatesCard.startingDownload")
                : t("updatesCard.download")}
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
              {status?.state === "checking"
                ? t("updatesCard.checking")
                : t("updatesCard.checkForUpdates")}
            </Button>
          )}
        </SettingRow>
      </SettingList>
      {status?.state === "available" ? (
        <div className="grid min-w-0 gap-3">
          <h3 className="text-sm font-medium">
            {t("updatesCard.whatSNewIn", { version: status.version ?? "" })}
          </h3>
          <UpdateRelease key={status.version} status={status} />
        </div>
      ) : null}
      {status?.state === "downloading" ? (
        <Progress
          aria-label={t("updatesCard.updateDownload")}
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
