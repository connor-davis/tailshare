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

const regions = [
  ["301", "NYC · New York"],
  ["302", "SFO · San Francisco"],
  ["303", "FRA · Frankfurt"],
  ["304", "TOK · Tokyo"],
  ["nearest", "Nearest"],
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
      setError(
        "Could not test this connection. Check your network and try again."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      id="connection-title"
      title="Connection"
      description="Choose a relay for your next room, or check this network."
    >
      <SettingList>
        <SettingRow
          label="Relay region"
          htmlFor="relay-region"
          description="Applies to your next room. A host outside FRA needs the other computer on Tailshare 0.1.4 or newer."
        >
          <Select
            value={settings.relayRegion}
            disabled={saving}
            onValueChange={(value) => {
              if (regions.some(([id]) => id === value))
                void save({ relayRegion: value as Settings["relayRegion"] })
            }}
          >
            <SelectTrigger id="relay-region" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {regions.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingList>
      <p className="text-sm text-muted-foreground">
        Nearest uses the lowest measured relay latency when you open a room.
        Joining also checks the other regions.
      </p>
      <div>
        <Button disabled={busy} onClick={() => void test()}>
          {busy ? "Testing connection…" : "Test my connection"}
        </Button>
      </div>
      {busy ? (
        <p
          role="status"
          aria-busy="true"
          className="text-sm text-muted-foreground"
        >
          Checking UDP and relay reachability…
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {result ? (
        <div role="status" className="flex flex-col gap-3 text-sm">
          <ul className="space-y-1" aria-label="Connection results">
            <li>UDP: {result.udp ? "OK" : "No response"}</li>
            <li>IPv4: {result.ipv4 ? "Available" : "Not observed"}</li>
            <li>IPv6: {result.ipv6 ? "Available" : "Not observed"}</li>
            <li>Nearest relay: {result.nearest ?? "Unknown"}</li>
            <li>
              Network sign-in:{" "}
              {result.captivePortal === "true" ? "May be required" : "Unknown"}
            </li>
            {result.regions.map(({ region, milliseconds }) => (
              <li key={region}>
                {region}:{" "}
                {milliseconds === null ? "No response" : `${milliseconds} ms`}
              </li>
            ))}
          </ul>
          {result.hints.map((hint) => (
            <p key={hint} className="text-muted-foreground">
              {hint}
            </p>
          ))}
        </div>
      ) : null}
    </Section>
  )
}
