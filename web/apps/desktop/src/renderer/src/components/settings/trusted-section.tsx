import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { SettingList, SettingRow } from "./setting-row"
import { Section, type SectionProps } from "./settings-fields"

/**
 * The computers that skip the Allow question. Adding happens on a join request;
 * here you only look and remove. A removed computer is asked next time.
 */
export function TrustedSection({ settings }: SectionProps) {
  const [error, setError] = useState("")
  const [removing, setRemoving] = useState("")

  async function remove(key: string) {
    setRemoving(key)
    setError("")
    try {
      await window.tailshare.revokeTrusted(key)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Tailshare could not remove that computer."
      )
    } finally {
      setRemoving("")
    }
  }

  const computers = settings.trustedComputers

  return (
    <Section
      id="settings-trusted"
      title="Trusted computers"
      description="These computers join your room without asking. They still need the code. Removing one only affects the next join."
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {computers.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No trusted computers yet. Choose "Trust this computer" when someone
          asks to join.
        </p>
      ) : (
        <SettingList role="list" aria-label="Trusted computers">
          {computers.map((computer) => (
            <SettingRow
              key={computer.key}
              label={computer.label}
              description={
                <>
                  {computer.fingerprint ? (
                    <>
                      Fingerprint{" "}
                      <span className="font-mono">{computer.fingerprint}</span>
                      {" · "}
                    </>
                  ) : null}
                  Added {new Date(computer.addedAt).toLocaleDateString()}
                </>
              }
            >
              <Button
                variant="outline"
                disabled={removing === computer.key}
                aria-label={`Remove ${computer.label}`}
                onClick={() => void remove(computer.key)}
              >
                Remove
              </Button>
            </SettingRow>
          ))}
        </SettingList>
      )}
    </Section>
  )
}
