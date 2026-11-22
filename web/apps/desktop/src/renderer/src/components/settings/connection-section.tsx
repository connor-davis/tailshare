import { useT } from "@/i18n/provider"
import { t } from "../../i18n/index"
import { useState } from "react"
import type { Settings } from "../../../../shared/bridge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch } from "@/lib/api/client"
import { SettingList, SettingRow } from "./setting-row"
import { Section, type SectionProps } from "./settings-fields"

const regions = () =>
  [
    ["301", t("connectionSection.nycNewYork")],
    ["302", t("connectionSection.sfoSanFrancisco")],
    ["303", t("connectionSection.fraFrankfurt")],
    ["304", t("connectionSection.tokTokyo")],
    ["nearest", t("connectionSection.nearest")],
  ] as const

interface ConnectionResult {
  udp: boolean
  ipv4: boolean
  ipv6: boolean
  nearest?: string
  captivePortal: "true" | "unknown"
  regions: { region: string; milliseconds: number | null }[]
  hints: string[]
}

/** Relay preference and an explicit, one-shot test of this computer's connection. */
export function ConnectionSection({ settings, save, saving }: SectionProps) {
  const t = useT()

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ConnectionResult | null>(null)
  const [error, setError] = useState("")

  async function test() {
    setBusy(true)
    setError("")
    setResult(null)
    try {
      setResult(
        await apiFetch<ConnectionResult>("/api/connection/test", {
          method: "POST",
        })
      )
    } catch {
      setError(t("connectionSection.couldNotTestThisConnectionCheckYour"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      id="connection-title"
      title={t("connectionSection.connection")}
      description={t("connectionSection.chooseARelayForYourNextRoom")}
    >
      <SettingList>
        <SettingRow
          label={t("connectionSection.relayRegion")}
          htmlFor="relay-region"
          description={t("connectionSection.appliesToYourNextRoomAHost")}
        >
          <Select
            value={settings.relayRegion}
            disabled={saving}
            onValueChange={(value) => {
              if (regions().some(([id]) => id === value))
                void save({ relayRegion: value as Settings["relayRegion"] })
            }}
          >
            <SelectTrigger id="relay-region" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {regions().map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingList>
      <p className="text-sm text-muted-foreground">
        {t("connectionSection.nearestUsesTheLowestMeasuredRelayLatency")}
      </p>
      <div>
        <Button disabled={busy} onClick={() => void test()}>
          {busy
            ? t("connectionSection.testingConnection")
            : t("connectionSection.testMyConnection")}
        </Button>
      </div>
      {busy ? (
        <p
          role="status"
          aria-busy="true"
          className="text-sm text-muted-foreground"
        >
          {t("connectionSection.checkingUDPAndRelayReachability")}
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {result ? (
        <div role="status" className="flex flex-col gap-3 text-sm">
          <ul
            className="space-y-1"
            aria-label={t("connectionSection.connectionResults")}
          >
            <li>
              {t("connectionSection.udp", {
                result: result.udp ? t("common.ok") : t("common.noResponse"),
              })}
            </li>
            <li>
              {t("connectionSection.ipv4", {
                result: result.ipv4
                  ? t("common.available")
                  : t("common.notObserved"),
              })}
            </li>
            <li>
              {t("connectionSection.ipv6", {
                result: result.ipv6
                  ? t("common.available")
                  : t("common.notObserved"),
              })}
            </li>
            <li>
              {t("connectionSection.nearestRelay", {
                region: result.nearest ?? t("common.unknown"),
              })}
            </li>
            <li>
              {t("connectionSection.networkSignIn", {
                result:
                  result.captivePortal === "true"
                    ? t("common.mayBeRequired")
                    : t("common.unknown"),
              })}
            </li>
            {result.regions.map(({ region, milliseconds }) => (
              <li key={region}>
                {region}:{" "}
                {milliseconds === null
                  ? t("connectionSection.noResponse")
                  : t("connectionSection.ms", { milliseconds: milliseconds })}
              </li>
            ))}
          </ul>
          {[
            ...(!result.udp ? [t("diagnostics.udpBlocked")] : []),
            ...(result.captivePortal === "true"
              ? [t("diagnostics.signIn")]
              : []),
            ...(!result.nearest ? [t("diagnostics.noRelay")] : []),
            t("diagnostics.limit"),
          ].map((hint) => (
            <p key={hint} className="text-muted-foreground">
              {hint}
            </p>
          ))}
        </div>
      ) : null}
    </Section>
  )
}
