import { useT } from "@/i18n/provider"
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
  const t = useT()

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
          : t("trustedSection.tailshareCouldNotRemoveThatComputer")
      )
    } finally {
      setRemoving("")
    }
  }

  const computers = settings.trustedComputers

  return (
    <Section
      id="settings-trusted"
      title={t("trustedSection.trustedComputers")}
      description={t("trustedSection.theseComputersJoinYourRoomWithoutAsking")}
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {computers.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          {t("trustedSection.noTrustedComputersYetChooseTrustThis")}
        </p>
      ) : (
        <SettingList
          role="list"
          aria-label={t("trustedSection.trustedComputers")}
        >
          {computers.map((computer) => (
            <SettingRow
              key={computer.key}
              label={computer.label}
              description={
                <>
                  {computer.fingerprint ? (
                    <>
                      {t("trustedSection.fingerprint")}{" "}
                      <span className="font-mono">{computer.fingerprint}</span>
                      {" · "}
                    </>
                  ) : null}
                  {t("trustedSection.added")}
                  {new Date(computer.addedAt).toLocaleDateString()}
                </>
              }
            >
              <Button
                variant="outline"
                disabled={removing === computer.key}
                aria-label={t("trustedSection.removeLabel2", {
                  label: computer.label,
                })}
                onClick={() => void remove(computer.key)}
              >
                {t("trustedSection.remove")}
              </Button>
            </SettingRow>
          ))}
        </SettingList>
      )}
    </Section>
  )
}
